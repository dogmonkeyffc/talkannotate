import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
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
  app.get('/api/health', async () => ({
    status: 'ok',
  }))

  app.get('/api/documents', async () => ({
    items: store.listDocuments(),
  }))

  app.post('/api/documents', async (request, reply) => {
    const payload = pushDocumentSchema.parse(request.body)
    const detail = store.upsertDocument(payload)
    reply.status(201).send(detail)
  })

  app.get('/api/documents/:slug/content', async (request) => {
    const { slug } = request.params as { slug: string }
    const { version } = request.query as { version?: string }
    return store.getDocumentDetail(slug, version ? Number(version) : undefined)
  })

  app.get('/api/documents/:slug/versions', async (request) => {
    const { slug } = request.params as { slug: string }
    return {
      items: store.listVersions(slug),
    }
  })

  app.get('/api/documents/:slug/annotations', async (request) => {
    const { slug } = request.params as { slug: string }
    const { version } = request.query as { version?: string }
    return {
      items: store.listAnnotations(slug, version ? Number(version) : undefined),
    }
  })

  app.post('/api/documents/:slug/annotations', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const payload = createAnnotationSchema.parse(request.body)
    const annotation = store.createAnnotation(slug, payload)
    reply.status(201).send(annotation)
  })

  app.delete('/api/annotations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    store.deleteAnnotation(id)
    reply.status(204).send()
  })

  // Backup: stream a .tar.gz of the entire data directory
  app.get('/api/backup', async (_request, reply) => {
    const date = new Date().toISOString().slice(0, 10)
    const filename = `talkannotate-backup-${date}.tar.gz`
    reply.header('Content-Type', 'application/gzip')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)

    const tar = spawn('tar', ['-czf', '-', '-C', dataDir, '.'])
    return reply.send(tar.stdout)
  })

  // Restore: accept a .tar.gz upload and extract into the data directory
  app.post('/api/restore', async (request, reply) => {
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
  })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}
