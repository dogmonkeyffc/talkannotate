import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

import type {
  AnnotationRecord,
  CreateAnnotationInput,
  DocumentDetail,
  DocumentListItem,
  DocumentVersionSummary,
  OutlineItem,
  PushDocumentInput,
} from './types.js'
import { formatUtcTimestampForApi } from './time.js'

type DocumentRow = {
  current_file_path?: string
  current_version: number
  id: string
  slug: string
  title: string
  updated_at: string
}

type VersionRow = {
  change_log: string
  created_at: string
  file_path: string
  summary: string
  title: string
  version: number
}

type AnnotationRow = {
  block_id: string
  color: string
  context_after: string
  context_before: string
  created_at: string
  end_col: number | null
  end_line: number | null
  end_offset: number
  id: string
  note: string
  quote: string
  selected_text: string
  start_col: number | null
  start_line: number | null
  start_offset: number
  version: number
}

const VERSION_PAD = 4

const sampleDocument = `# TalkAnnotate

## Why this exists

TalkAnnotate is a lightweight review surface for architecture conversations with AI agents. The markdown itself stays on disk, while annotations and versions stay queryable.

## Reading workflow

1. Push markdown into the backend through the REST API.
2. Browse document summaries in the left pane.
3. Preview rendered markdown and Mermaid diagrams on the right.
4. Select text to anchor an annotation.

## Mermaid support

\`\`\`mermaid
flowchart LR
    Agent[AI Agent CLI] --> API[Fastify API]
    API --> Files[Markdown files]
    API --> DB[(SQLite)]
    UI[React Preview] --> API
\`\`\`

## Versioning

Every markdown push creates a version snapshot on disk under \`data/versions\`.
`

export class DocumentStore {
  private readonly dbPath: string

  private readonly currentMarkdownDir: string

  private db: Database.Database

  private readonly exportsDir: string

  private readonly versionsDir: string

  constructor(private readonly dataDir: string) {
    this.currentMarkdownDir = path.join(this.dataDir, 'markdown')
    this.versionsDir = path.join(this.dataDir, 'versions')
    this.exportsDir = path.join(this.dataDir, 'exports')
    this.dbPath = path.join(this.dataDir, 'app.db')

    this.ensureDirectories()
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  close() {
    this.db.close()
  }

  seedIfEmpty() {
    const row = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM documents')
      .get()

    if (row?.count === 0) {
      this.upsertDocument({
        content: sampleDocument,
        title: 'Welcome',
      })
    }
  }

  listDocuments(): DocumentListItem[] {
    const rows = this.db
      .prepare<
        [],
        {
          currentVersion: number
          id: string
          slug: string
          summary: string
          title: string
          updatedAt: string
          versionsCount: number
        }
      >(
        `SELECT
          d.id,
          d.slug,
          d.title,
          d.current_version AS currentVersion,
          d.updated_at AS updatedAt,
          COALESCE(v.summary, '') AS summary,
          (
            SELECT COUNT(*)
            FROM document_versions dv
            WHERE dv.document_id = d.id
          ) AS versionsCount
        FROM documents d
        LEFT JOIN document_versions v
          ON v.document_id = d.id
         AND v.version = d.current_version
        ORDER BY d.updated_at DESC`,
      )
      .all()

    return rows.map((row) => ({
      ...row,
      updatedAt: formatUtcTimestampForApi(row.updatedAt),
    }))
  }

  getDocumentDetail(documentId: string, requestedVersion?: number): DocumentDetail {
    const document = this.getDocumentRow(documentId)
    const selectedVersion = requestedVersion ?? document.current_version
    const versionRow = this.getVersionRow(document.id, selectedVersion)
    const content = readFileSync(path.join(this.dataDir, versionRow.file_path), 'utf8')

    return {
      annotations: this.listAnnotations(documentId, selectedVersion),
      changeLog: versionRow.change_log,
      content,
      currentVersion: document.current_version,
      id: document.id,
      outline: extractOutline(content),
      selectedVersion,
      slug: document.slug,
      summary: versionRow.summary,
      title: document.title,
      updatedAt: formatUtcTimestampForApi(document.updated_at),
      versions: this.listVersions(documentId),
    }
  }

  listVersions(documentId: string): DocumentVersionSummary[] {
    const document = this.getDocumentRow(documentId)
    return this.db
      .prepare<
        string,
        {
          changeLog: string
          createdAt: string
          summary: string
          title: string
          version: number
        }
      >(
        `SELECT
           version,
           title,
           summary,
           change_log AS changeLog,
           created_at AS createdAt
         FROM document_versions
         WHERE document_id = ?
         ORDER BY version DESC`,
      )
      .all(document.id)
      .map((row) => mapVersionSummary(row))
  }

  listAnnotations(documentId: string, version?: number): AnnotationRecord[] {
    const document = this.getDocumentRow(documentId)
    const selectedVersion = version ?? document.current_version

    const rows = this.db
      .prepare<[string, number], AnnotationRow>(
        `SELECT
          id,
          version,
          note,
          color,
          block_id,
          selected_text,
          quote,
          start_offset,
          end_offset,
          context_before,
          context_after,
          start_line,
          start_col,
          end_line,
          end_col,
          created_at
        FROM annotations
        WHERE document_id = ?
          AND version = ?
        ORDER BY created_at DESC`,
      )
      .all(document.id, selectedVersion)

    return rows.map(mapAnnotationRow)
  }

  upsertDocument(input: PushDocumentInput): DocumentDetail {
    const title = input.title.trim()
    const content = input.content.replace(/\r\n/g, '\n')
    const contentHash = hashContent(content)
    const summary = extractSummary(content)
    const existingDocument = input.id ? this.findDocumentRow(input.id) : undefined
    const documentId = existingDocument?.id ?? randomUUID()
    const slug = existingDocument?.slug ?? `${normalizeSlug(title)}-${documentId.slice(0, 8)}`

    if (existingDocument) {
      const currentVersion = this.getVersionMetadata(
        existingDocument.id,
        existingDocument.current_version,
      )

      if (
        currentVersion &&
        currentVersion.hash === contentHash &&
        existingDocument.title === title
      ) {
        return this.getDocumentDetail(existingDocument.id)
      }
    }

    const nextVersion = existingDocument ? existingDocument.current_version + 1 : 1
    const filePaths = this.writeMarkdownFiles(documentId, nextVersion, content)

    this.db.transaction(() => {
      if (existingDocument) {
        this.db
          .prepare(
            `UPDATE documents
             SET title = ?,
                 current_version = ?,
                 current_file_path = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .run(title, nextVersion, filePaths.currentFilePath, existingDocument.id)
      } else {
        this.db
          .prepare(
            `INSERT INTO documents (
               id,
               slug,
               title,
               current_version,
               current_file_path
             ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(documentId, slug, title, nextVersion, filePaths.currentFilePath)
      }

      this.db
        .prepare(
          `INSERT INTO document_versions (
             id,
             document_id,
             version,
             title,
             content_hash,
             summary,
             file_path
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          documentId,
          nextVersion,
          title,
          contentHash,
          summary,
          filePaths.versionFilePath,
        )
    })()

    return this.getDocumentDetail(documentId, nextVersion)
  }

  updateVersionChangeLog(documentId: string, version: number, changeLog: string): DocumentVersionSummary {
    const document = this.getDocumentRow(documentId)
    this.getVersionRow(document.id, version)

    const result = this.db
      .prepare(
        `UPDATE document_versions
         SET change_log = ?
         WHERE document_id = ?
           AND version = ?`,
      )
      .run(changeLog, document.id, version)

    if (result.changes === 0) {
      throw new Error(`Version ${version} was not found.`)
    }

    return this.getVersionSummary(document.id, version)
  }

  createAnnotation(documentId: string, input: CreateAnnotationInput): AnnotationRecord {
    const document = this.getDocumentRow(documentId)
    const version = input.version ?? document.current_version

    this.getVersionRow(document.id, version)

    const id = randomUUID()

    this.db
      .prepare(
        `INSERT INTO annotations (
           id,
           document_id,
           version,
           note,
           color,
           block_id,
           selected_text,
           quote,
           start_offset,
           end_offset,
           context_before,
           context_after,
           start_line,
           start_col,
           end_line,
           end_col
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        document.id,
        version,
        input.note,
        input.color,
        input.anchor.blockId,
        input.anchor.selectedText,
        input.anchor.quote,
        input.anchor.startOffset,
        input.anchor.endOffset,
        input.anchor.contextBefore,
        input.anchor.contextAfter,
        input.anchor.startLine,
        input.anchor.startCol,
        input.anchor.endLine,
        input.anchor.endCol,
      )

    const row = this.db
      .prepare<string, AnnotationRow>(
        `SELECT
          id,
          version,
          note,
          color,
          block_id,
          selected_text,
          quote,
          start_offset,
          end_offset,
          context_before,
          context_after,
          start_line,
          start_col,
          end_line,
          end_col,
          created_at
        FROM annotations
        WHERE id = ?`,
      )
      .get(id)

    if (!row) {
      throw new Error(`Annotation "${id}" was not found after creation.`)
    }

    return mapAnnotationRow(row)
  }

  deleteAnnotation(id: string) {
    const result = this.db.prepare('DELETE FROM annotations WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new Error(`Annotation "${id}" was not found.`)
    }
  }

  deleteDocument(documentId: string) {
    const document = this.getDocumentRow(documentId)
    const currentFilePath = document.current_file_path
      ? path.join(this.dataDir, document.current_file_path)
      : path.join(this.currentMarkdownDir, `${document.id}.md`)
    const versionDirectory = path.join(this.versionsDir, document.id)

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM annotations WHERE document_id = ?').run(document.id)
      this.db.prepare('DELETE FROM document_versions WHERE document_id = ?').run(document.id)
      this.db.prepare('DELETE FROM documents WHERE id = ?').run(document.id)

      rmSync(currentFilePath, { force: true })
      rmSync(versionDirectory, { force: true, recursive: true })
    })()
  }

  private ensureDirectories() {
    for (const directory of [
      this.dataDir,
      this.currentMarkdownDir,
      this.versionsDir,
      this.exportsDir,
    ]) {
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true })
      }
    }
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        current_version INTEGER NOT NULL,
        current_file_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS document_versions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        summary TEXT NOT NULL,
        change_log TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(document_id, version)
      );

      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        note TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT 'violet',
        block_id TEXT NOT NULL,
        selected_text TEXT NOT NULL,
        quote TEXT NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        context_before TEXT NOT NULL DEFAULT '',
        context_after TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
    `)

    // Additive migrations for new columns (safe to run on existing databases)
    const addColumn = (sql: string) => {
      try {
        this.db.exec(sql)
      } catch {
        // Column already exists — ignore
      }
    }

    addColumn('ALTER TABLE annotations ADD COLUMN start_line INTEGER')
    addColumn('ALTER TABLE annotations ADD COLUMN start_col INTEGER')
    addColumn('ALTER TABLE annotations ADD COLUMN end_line INTEGER')
    addColumn('ALTER TABLE annotations ADD COLUMN end_col INTEGER')
    addColumn("ALTER TABLE document_versions ADD COLUMN change_log TEXT NOT NULL DEFAULT ''")
  }

  private getDocumentRow(documentId: string): DocumentRow {
    const row = this.findDocumentRow(documentId)
    if (!row) {
      throw new Error(`Document "${documentId}" was not found.`)
    }

    return row
  }

  private findDocumentRow(documentId: string): DocumentRow | undefined {
    return this.db
      .prepare<string, DocumentRow>(
        `SELECT
          id,
          slug,
          title,
          current_file_path,
          current_version,
          updated_at
        FROM documents
        WHERE id = ?`,
      )
      .get(documentId)
  }

  private getVersionRow(documentId: string, version: number): VersionRow {
    const row = this.db
      .prepare<[string, number], VersionRow>(
        `SELECT
           version,
           title,
           summary,
           change_log,
           file_path,
           created_at
         FROM document_versions
        WHERE document_id = ?
          AND version = ?`,
      )
      .get(documentId, version)

    if (!row) {
      throw new Error(`Version ${version} was not found.`)
    }

    return row
  }

  private getVersionSummary(documentId: string, version: number): DocumentVersionSummary {
    const row = this.db
      .prepare<
        [string, number],
        {
          changeLog: string
          createdAt: string
          summary: string
          title: string
          version: number
        }
      >(
        `SELECT
           version,
           title,
           summary,
           change_log AS changeLog,
           created_at AS createdAt
         FROM document_versions
         WHERE document_id = ?
           AND version = ?`,
      )
      .get(documentId, version)

    if (!row) {
      throw new Error(`Version ${version} was not found.`)
    }

    return mapVersionSummary(row)
  }

  private getVersionMetadata(documentId: string, version: number): { hash: string } | undefined {
    return this.db
      .prepare<[string, number], { hash: string }>(
        `SELECT
          content_hash AS hash
        FROM document_versions
        WHERE document_id = ?
          AND version = ?`,
      )
      .get(documentId, version)
  }

  private writeMarkdownFiles(documentId: string, version: number, content: string) {
    const currentFilePath = path.join('markdown', `${documentId}.md`)
    const versionDir = path.join(this.versionsDir, documentId)
    const versionFileName = `v${String(version).padStart(VERSION_PAD, '0')}.md`
    const versionFilePath = path.join('versions', documentId, versionFileName)

    mkdirSync(versionDir, { recursive: true })
    writeFileSync(path.join(this.dataDir, currentFilePath), content, 'utf8')
    writeFileSync(path.join(this.dataDir, versionFilePath), content, 'utf8')

    return { currentFilePath, versionFilePath }
  }
}

function extractSummary(markdown: string) {
  const lines = markdown.split('\n').map((line) => line.trim())
  const heading = lines.find((line) => /^#{1,6}\s+/.test(line))
  if (heading) {
    return heading.replace(/^#{1,6}\s+/, '')
  }

  const paragraph = lines.find((line) => line.length > 0 && !line.startsWith('```'))
  return (paragraph ?? 'Markdown document').slice(0, 160)
}

function extractOutline(markdown: string): OutlineItem[] {
  return markdown
    .split('\n')
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (!match) {
        return undefined
      }

      const hashes = match[1]
      const text = match[2]
      if (!hashes || !text) {
        return undefined
      }

      return {
        depth: hashes.length,
        line: index + 1,
        slug: normalizeSlug(text),
        text,
      }
    })
    .filter((item): item is OutlineItem => item !== undefined)
}

function hashContent(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

function normalizeSlug(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || `document-${Date.now()}`
}

function mapVersionSummary(row: {
  changeLog: string
  createdAt: string
  summary: string
  title: string
  version: number
}): DocumentVersionSummary {
  return {
    ...row,
    createdAt: formatUtcTimestampForApi(row.createdAt),
  }
}

function mapAnnotationRow(row: AnnotationRow): AnnotationRecord {
  return {
    blockId: row.block_id,
    color: row.color,
    contextAfter: row.context_after,
    contextBefore: row.context_before,
    createdAt: formatUtcTimestampForApi(row.created_at),
    endCol: row.end_col,
    endLine: row.end_line,
    endOffset: row.end_offset,
    id: row.id,
    note: row.note,
    quote: row.quote,
    selectedText: row.selected_text,
    startCol: row.start_col,
    startLine: row.start_line,
    startOffset: row.start_offset,
    version: row.version,
  }
}
