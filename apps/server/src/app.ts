import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

import { DocumentStore } from './store.js'
import { createAnnotationSchema, pushDocumentSchema } from './types.js'

const sourceDir = path.dirname(fileURLToPath(import.meta.url))
const defaultDataDir = path.resolve(sourceDir, '../../../data')
const publicDir = path.resolve(sourceDir, '../public')

export function createApp() {
  const app = Fastify({
    logger: true,
  })

  const dataDir = process.env.TALKANNOTATE_DATA_DIR ?? defaultDataDir
  const store = new DocumentStore(dataDir)
  store.seedIfEmpty()

  app.addHook('onClose', async () => {
    store.close()
  })

  app.register(cors, {
    origin: true,
  })

  app.register(fastifySwagger, {
    swagger: {
      info: {
        title: 'TalkAnnotate API',
        description: '文档批注服务 REST API',
        version: '1.0.0',
      },
      host: 'localhost:3000',
      basePath: '/',
      schemes: ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
    },
  })

  app.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
  })

  app.register(fastifyStatic, {
    prefix: '/',
    root: publicDir,
  })

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body)
    },
  )

  registerApiRoutes(app, store, dataDir)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: 'Bad Request',
        issues: error.issues,
        message: 'Payload validation failed.',
      })
      return
    }

    const message = getErrorMessage(error)

    if (message.includes('was not found')) {
      reply.status(404).send({
        error: 'Not Found',
        message,
      })
      return
    }

    app.log.error(error)
    reply.status(500).send({
      error: 'Internal Server Error',
      message,
    })
  })

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Route ${request.url} was not found.`,
      })
      return
    }

    return reply.sendFile('index.html')
  })

  return app
}

function registerApiRoutes(app: FastifyInstance, store: DocumentStore, dataDir: string) {
  app.get('/api/health', { schema: { tags: ['health'] } }, async () => ({
    status: 'ok',
  }))

  app.get(
    '/api/documents',
    {
      schema: {
        tags: ['documents'],
        description: '列出所有文档',
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    slug: { type: 'string' },
                    title: { type: 'string' },
                    summary: { type: 'string' },
                    currentVersion: { type: 'number' },
                    versionsCount: { type: 'number' },
                    updatedAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => ({
      items: store.listDocuments(),
    }),
  )

  app.post(
    '/api/documents',
    {
      schema: {
        tags: ['documents'],
        description: '创建或更新文档（如果 slug 已存在则追加版本）',
        body: {
          type: 'object',
          required: ['title', 'content'],
          properties: {
            title: { type: 'string', description: '文档标题' },
            content: { type: 'string', description: 'Markdown 内容' },
            slug: { type: 'string', description: '文档 slug（可选，自动生成）' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              title: { type: 'string' },
              summary: { type: 'string' },
              content: { type: 'string' },
              currentVersion: { type: 'number' },
              updatedAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const payload = pushDocumentSchema.parse(request.body)
      const detail = store.upsertDocument(payload)
      reply.status(201).send(detail)
    },
  )

  app.get(
    '/api/documents/:slug/content',
    {
      schema: {
        tags: ['documents'],
        description: '获取文档内容（支持按版本查询）',
        params: {
          type: 'object',
          required: ['slug'],
          properties: {
            slug: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            version: { type: 'number', description: '版本号（可选）' },
          },
        },
      },
    },
    async (request) => {
      const { slug } = request.params as { slug: string }
      const { version } = request.query as { version?: string }
      return store.getDocumentDetail(slug, version ? Number(version) : undefined)
    },
  )

  app.get(
    '/api/documents/:slug/versions',
    {
      schema: {
        tags: ['documents'],
        description: '列出文档的所有版本',
        params: {
          type: 'object',
          required: ['slug'],
          properties: {
            slug: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { slug } = request.params as { slug: string }
      return {
        items: store.listVersions(slug),
      }
    },
  )

  app.get(
    '/api/documents/:slug/annotations',
    {
      schema: {
        tags: ['annotations'],
        description: '获取文档的所有批注',
        params: {
          type: 'object',
          required: ['slug'],
          properties: {
            slug: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            version: { type: 'number', description: '版本号（可选）' },
          },
        },
      },
    },
    async (request) => {
      const { slug } = request.params as { slug: string }
      const { version } = request.query as { version?: string }
      return {
        items: store.listAnnotations(slug, version ? Number(version) : undefined),
      }
    },
  )

  app.post(
    '/api/documents/:slug/annotations',
    {
      schema: {
        tags: ['annotations'],
        description: '在文档上创建批注',
        params: {
          type: 'object',
          required: ['slug'],
          properties: {
            slug: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['anchor', 'note'],
          properties: {
            anchor: {
              type: 'object',
              required: ['blockId', 'quote', 'selectedText', 'startOffset', 'endOffset'],
              properties: {
                blockId: { type: 'string' },
                quote: { type: 'string' },
                selectedText: { type: 'string' },
                startOffset: { type: 'number' },
                endOffset: { type: 'number' },
                contextBefore: { type: 'string' },
                contextAfter: { type: 'string' },
                startCol: { type: 'number' },
                endCol: { type: 'number' },
                startLine: { type: 'number' },
                endLine: { type: 'number' },
              },
            },
            note: { type: 'string', description: '批注内容' },
            color: { type: 'string', enum: ['violet'], description: '批注颜色' },
            version: { type: 'number', description: '文档版本号' },
          },
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params as { slug: string }
      const payload = createAnnotationSchema.parse(request.body)
      const annotation = store.createAnnotation(slug, payload)
      reply.status(201).send(annotation)
    },
  )

  app.delete(
    '/api/annotations/:id',
    {
      schema: {
        tags: ['annotations'],
        description: '删除批注',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      store.deleteAnnotation(id)
      reply.status(204).send()
    },
  )

  // Backup: stream a .tar.gz of the entire data directory
  app.get(
    '/api/backup',
    {
      schema: {
        tags: ['backup'],
        description: '导出数据备份（tar.gz 格式）',
      },
    },
    async (_request, reply) => {
      const date = new Date().toISOString().slice(0, 10)
      const filename = `talkannotate-backup-${date}.tar.gz`
      reply.header('Content-Type', 'application/gzip')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)

      const tar = spawn('tar', ['-czf', '-', '-C', dataDir, '.'])
      return reply.send(tar.stdout)
    },
  )

  // Restore: accept a .tar.gz upload and extract into the data directory
  app.post(
    '/api/restore',
    {
      schema: {
        tags: ['backup'],
        description: '导入数据备份（上传 tar.gz 文件）',
        consumes: ['application/octet-stream'],
      },
    },
    async (request, reply) => {
      const buffer = request.body as Buffer
      const tmpFile = path.join(tmpdir(), `talkannotate-restore-${randomUUID()}.tar.gz`)
      await writeFile(tmpFile, buffer)
      await new Promise<void>((resolve, reject) => {
        const tar = spawn('tar', ['-xzf', tmpFile, '-C', dataDir])
        tar.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`tar exited with code ${code}`)),
        )
      })
      await unlink(tmpFile)
      reply.status(200).send({ ok: true })
    },
  )
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}
