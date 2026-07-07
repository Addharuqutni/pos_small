import type { IncomingMessage, ServerResponse } from 'http'
import { buildApp } from './api/src/server.js'

// ponytail: Fastify serverless adapter
// Reuse app instance on warm start.
let appInstance: Awaited<ReturnType<typeof buildApp>> | null = null

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appInstance) {
    appInstance = await buildApp()
    await appInstance.ready()
  }

  // Forward native Node.js req/res to Fastify routing
  appInstance.server.emit('request', req, res)
}
