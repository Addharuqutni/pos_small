import type { IncomingMessage, ServerResponse } from 'http'
import { buildApp } from './src/server.js'

// ponytail: one lambda for all /api routes — Fastify toWebHandler bridges
// Vercel's Node (req,res) to Web Request/Response. Cold-start pays buildApp;
// warm invocations reuse the module-scope app.
const app = await buildApp()
const webHandler = app.toWebHandler()

async function nodeReqToWebRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    headers.set(key, Array.isArray(value) ? value.join(',') : value)
  }
  const method = (req.method || 'GET').toUpperCase()
  const init: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = []
    for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    if (body.length) init.body = body
  }
  return new Request(url, init)
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const response = await webHandler(await nodeReqToWebRequest(req))
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    const buf = Buffer.from(await response.arrayBuffer())
    res.end(buf)
  } catch (err) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ message: 'Internal server error' }))
    // Re-throw so Vercel logs the real error; response already sent.
    console.error(err)
  }
}
