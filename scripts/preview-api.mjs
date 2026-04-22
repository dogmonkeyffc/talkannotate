#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const [command, ...rest] = process.argv.slice(2)
const options = parseOptions(rest)
const baseUrl = normalizeBaseUrl(options['base-url'] ?? process.env.TALKANNOTATE_BASE_URL)

if (!command) {
  printUsageAndExit()
}

await run(command, options)

async function run(selectedCommand, selectedOptions) {
  switch (selectedCommand) {
    case 'annotations':
      await printJson(
        requestJson(
          buildUrl(
            `/api/documents/${required(selectedOptions.id, '--id')}/annotations`,
            optionalVersion(selectedOptions.version),
          ),
        ),
      )
      return
    case 'document':
      await printJson(
        requestJson(
          buildUrl(
            `/api/documents/${required(selectedOptions.id, '--id')}/content`,
            optionalVersion(selectedOptions.version),
          ),
        ),
      )
      return
    case 'documents':
      await printJson(requestJson('/api/documents'))
      return
    case 'publish': {
      const title = required(selectedOptions.title, '--title')
      const content = await readTextInput(selectedOptions)
      await printJson(
        requestJson('/api/documents', {
          body: JSON.stringify({
            content,
            ...(selectedOptions.id ? { id: selectedOptions.id } : {}),
            title,
          }),
          method: 'POST',
        }),
      )
      return
    }
    case 'set-changelog': {
      const changeLog = await readTextInput(selectedOptions)
      await printJson(
        requestJson(
          `/api/documents/${required(selectedOptions.id, '--id')}/versions/${required(selectedOptions.version, '--version')}/change-log`,
          {
            body: JSON.stringify({ changeLog }),
            method: 'PUT',
          },
        ),
      )
      return
    }
    case 'versions':
      await printJson(requestJson(`/api/documents/${required(selectedOptions.id, '--id')}/versions`))
      return
    default:
      console.error(`Unknown command: ${selectedCommand}`)
      printUsageAndExit(1)
  }
}

async function requestJson(pathname, init) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload ? payload.message : response.statusText
    throw new Error(`Request failed (${response.status}): ${message ?? 'Unknown error'}`)
  }

  return payload
}

function buildUrl(pathname, params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

function optionalVersion(value) {
  return value ? { version: value } : undefined
}

async function readTextInput(selectedOptions) {
  if (selectedOptions.text) {
    return String(selectedOptions.text)
  }

  if (selectedOptions.file) {
    return readFile(String(selectedOptions.file), 'utf8')
  }

  throw new Error('One of --text or --file is required.')
}

function parseOptions(args) {
  const parsed = {}

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (!token?.startsWith('--')) {
      continue
    }

    const key = token.slice(2)
    const next = args[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true'
      continue
    }

    parsed[key] = next
    index += 1
  }

  return parsed
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`)
  }

  return String(value)
}

function normalizeBaseUrl(value) {
  return (value || 'http://localhost:3180').replace(/\/+$/, '')
}

async function printJson(promise) {
  const payload = await promise
  console.log(JSON.stringify(payload, null, 2))
}

function printUsageAndExit(code = 0) {
  console.error(`Usage:
  node scripts/preview-api.mjs documents
  node scripts/preview-api.mjs publish --title "<title>" --file /absolute/path/to/doc.md [--id <document-id>]
  node scripts/preview-api.mjs document --id <document-id> [--version <n>]
  node scripts/preview-api.mjs versions --id <document-id>
  node scripts/preview-api.mjs annotations --id <document-id> [--version <n>]
  node scripts/preview-api.mjs set-changelog --id <document-id> --version <n> (--text "<log>" | --file /absolute/path/to/change-log.md)

Optional:
  --base-url <url>   Override service base URL (default: http://localhost:3180)`)
  process.exit(code)
}
