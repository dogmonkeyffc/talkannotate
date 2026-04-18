# TalkAnnotate — AI Agent Skill

TalkAnnotate is a self-hosted document annotation system. Documents are written in Markdown and versioned automatically. Readers leave inline annotations (comments) tied to specific text blocks. This skill explains how an AI agent can interact with TalkAnnotate programmatically.

---

## Base URL

```
http://localhost:3180
```

Health check:

```
GET /api/health
→ { "status": "ok" }
```

---

## Documents

### List all documents

```
GET /api/documents
→ { "items": [ { "slug": string, "title": string, "version": number, "updatedAt": string } ] }
```

### Push (create or update) a document

```
POST /api/documents
Content-Type: application/json

{
  "slug": "my-doc",        // URL-safe identifier, used as the document key
  "title": "My Document",  // human-readable title shown in the sidebar
  "content": "# Hello\n\nThis is the document body in Markdown."
}
→ 201  { slug, title, version, content, createdAt, updatedAt }
```

- Every push creates a **new version**. Previous versions are retained and accessible.
- `slug` is the stable identifier. Re-pushing the same slug increments the version.

### Get document content

```
GET /api/documents/:slug/content
GET /api/documents/:slug/content?version=3   # specific version
→ { slug, title, version, content, createdAt, updatedAt }
```

### List versions

```
GET /api/documents/:slug/versions
→ { "items": [ { "version": number, "createdAt": string } ] }
```

---

## Annotations

Annotations are inline comments attached to a specific **block** (paragraph, heading, code block, etc.) identified by a zero-based `blockIndex`.

### List annotations for a document

```
GET /api/documents/:slug/annotations
GET /api/documents/:slug/annotations?version=3
→ { "items": [ { id, slug, version, blockIndex, text, createdAt } ] }
```

### Create an annotation

```
POST /api/documents/:slug/annotations
Content-Type: application/json

{
  "version": 2,          // which document version this annotation targets
  "blockIndex": 0,       // zero-based index of the Markdown block
  "text": "Great point!" // annotation body (plain text)
}
→ 201  { id, slug, version, blockIndex, text, createdAt }
```

### Delete an annotation

```
DELETE /api/annotations/:id
→ 204 No Content
```

---

## Backup & Restore

### Download a full backup

```
GET /api/backup
→ 200  application/gzip  (filename: talkannotate-backup-YYYY-MM-DD.tar.gz)
```

Downloads a `.tar.gz` archive of the entire data directory (database + Markdown version files).

### Restore from backup

```
POST /api/restore
Content-Type: application/octet-stream
Body: <binary .tar.gz buffer>

→ 200  { "ok": true }
```

Extracts the archive into the data directory. The in-memory store is not automatically refreshed — reload the web UI or restart the server after a restore.

---

## Typical agent workflows

### Publish a new document version

```bash
curl -X POST http://localhost:3180/api/documents \
  -H "Content-Type: application/json" \
  -d '{"slug":"release-notes","title":"Release Notes","content":"# v1.2\n\n- Fixed bug X"}'
```

### Read all annotations left on a document

```bash
curl http://localhost:3180/api/documents/release-notes/annotations
```

### Act on annotations (review loop)

1. `GET /api/documents/:slug/annotations` — collect all open annotations.
2. For each annotation, read `blockIndex` to locate the relevant section in `GET /api/documents/:slug/content`.
3. Revise the document content accordingly.
4. `POST /api/documents/:slug` with the updated `content` to publish a new version.
5. `DELETE /api/annotations/:id` for each resolved annotation.

---

## Data layout (inside Docker volume `talkannotate_app-data`)

```
app.db           ← SQLite database (documents, versions, annotations tables)
versions/
  <slug>/
    v0001.md     ← Markdown source for version 1
    v0002.md     ← Markdown source for version 2
    ...
```

To inspect directly (read-only):

```bash
docker run --rm -v talkannotate_app-data:/data alpine sh -c "ls /data/versions/"
docker run --rm -v talkannotate_app-data:/data alpine sh -c \
  "apk add -q sqlite && sqlite3 /data/app.db 'SELECT slug,version FROM documents ORDER BY slug,version'"
```

---

## Error responses

| Status | Meaning                                                                    |
| ------ | -------------------------------------------------------------------------- |
| 400    | Payload validation failed (Zod schema error); body contains `issues` array |
| 404    | Document or annotation not found                                           |
| 500    | Internal server error                                                      |
