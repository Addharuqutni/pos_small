import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { errorHandler } from './lib/errors.js'
import { authRoutes } from './modules/auth.js'
import { categoryRoutes } from './modules/categories.js'
import { productRoutes } from './modules/products.js'
import { userRoutes } from './modules/users.js'
import { settingsRoutes } from './modules/settings.js'
import { shiftRoutes } from './modules/shifts.js'
import { saleRoutes } from './modules/sales.js'
import { stockRoutes } from './modules/stock.js'
import { reportRoutes } from './modules/reports.js'
import { auditRoutes } from './modules/audit.js'

const app = Fastify({ logger: true })
const sessionSecret = process.env.SESSION_SECRET
if (process.env.NODE_ENV === 'production' && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production')
}

await app.register(cookie, {
  secret: sessionSecret || 'dev-secret-change-me',
})

// CORS — require an explicit origin in production (no localhost fallback there).
const corsOrigin = process.env.APP_URL
if (process.env.NODE_ENV === 'production' && !corsOrigin) {
  throw new Error('APP_URL must be set in production to define the allowed CORS origin')
}
await app.register(cors, {
  origin: corsOrigin || 'http://localhost:3000',
  credentials: true,
})

// Global rate limit — generous ceiling; login has its own tighter bucket below.
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

await app.register(errorHandler)

// Routes — all prefixed /api
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(categoryRoutes, { prefix: '/api/categories' })
await app.register(productRoutes, { prefix: '/api/products' })
await app.register(userRoutes, { prefix: '/api/users' })
await app.register(settingsRoutes, { prefix: '/api/settings' })
await app.register(shiftRoutes, { prefix: '/api/shifts' })
await app.register(saleRoutes, { prefix: '/api/sales' })
await app.register(stockRoutes, { prefix: '/api/stock' })
await app.register(reportRoutes, { prefix: '/api/reports' })
await app.register(auditRoutes, { prefix: '/api/audit' })

// Health check
app.get('/api/health', async () => ({ status: 'ok' }))

const port = Number(process.env.PORT) || 4000
await app.listen({ port, host: '0.0.0.0' })
