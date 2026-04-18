# TalkAnnotate

TalkAnnotate is a single-container Markdown discussion workspace for AI-assisted architecture review. Markdown files stay on disk, metadata stays in SQLite, and the UI focuses on reading, version browsing, Mermaid preview, and anchored annotations.

## Stack

- **Backend:** Node.js, Fastify, TypeScript, better-sqlite3, ts-pattern
- **Frontend:** React, Vite, Mantine, react-markdown, Mermaid
- **Tooling:** pnpm workspace, ESLint, Prettier, Changesets
- **Storage:** SQLite plus file-backed Markdown snapshots
- **Deployment:** Docker Compose, single runtime container

## Start

```bash
docker compose up -d
```

The app serves on `http://localhost:3180` by default.

If that host port is occupied, override it:

```bash
TALKANNOTATE_HOST_PORT=3000 docker compose up -d
```

## Local commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

## Data layout

```text
data/
  app.db
  markdown/
    <slug>.md
  versions/
    <slug>/
      v0001.md
      v0002.md
```

The `data/` directory is mounted into the container as a volume.

## REST API

### Health

```http
GET /api/health
```

### Push or update a Markdown document

```http
POST /api/documents
Content-Type: application/json

{
  "title": "Architecture Overview",
  "slug": "architecture-overview",
  "content": "# Architecture Overview\n\n## Goals\n..."
}
```

Each push creates a new version snapshot if the content changed.

### List documents

```http
GET /api/documents
```

### Read one document version

```http
GET /api/documents/:slug/content?version=2
```

### List versions

```http
GET /api/documents/:slug/versions
```

### List annotations

```http
GET /api/documents/:slug/annotations?version=2
```

### Create an anchored annotation

```http
POST /api/documents/:slug/annotations
Content-Type: application/json

{
  "version": 2,
  "note": "This section needs a boundary between ingest and query services.",
  "color": "violet",
  "anchor": {
    "blockId": "p-421",
    "selectedText": "query services",
    "quote": "query services",
    "startOffset": 15,
    "endOffset": 29,
    "contextBefore": "between ingest and ",
    "contextAfter": "."
  }
}
```

## Export and import

Export a runnable tar bundle:

```bash
pnpm export:tar
```

Import a bundle and restart the app:

```bash
pnpm import:tar -- ./exports/talkannotate-bundle-YYYYMMDDHHMMSS.tar
```

The exported tar contains the built Docker image, `docker-compose.yml`, and the mounted `data/` directory.
