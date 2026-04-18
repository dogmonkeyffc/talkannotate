import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const app = createApp()

try {
  await app.listen({ host, port })
  app.log.info(`TalkAnnotate server listening on http://${host}:${port}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
