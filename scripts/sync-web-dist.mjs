import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptsDir, '..')
const webDistDir = path.join(rootDir, 'apps', 'web', 'dist')
const serverPublicDir = path.join(rootDir, 'apps', 'server', 'public')

if (!existsSync(webDistDir)) {
  throw new Error(`Missing web build output at ${webDistDir}`)
}

rmSync(serverPublicDir, { force: true, recursive: true })
mkdirSync(serverPublicDir, { recursive: true })
cpSync(webDistDir, serverPublicDir, { recursive: true })
