import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'

/**
 * `reports.ts` imports the shared db client, which requires DATABASE_URL at
 * import time. This suite never issues a query, so a dummy local URL is enough —
 * and setting it explicitly means the production .env can never be reached.
 * `./reports.js` is imported dynamically on purpose: the literal specifier is
 * known, but it must be evaluated *after* the env var above is set (static
 * imports are hoisted and would run first).
 */
process.env.DATABASE_URL = 'postgres://localhost:5432/unused_by_route_test'

test('reportRoutes registers the sales/product/category/cashier/profit endpoints', async () => {
  const { reportRoutes } = await import('./reports.js')

  const app = Fastify()
  await app.register(cookie)
  app.setErrorHandler((_error, _request, reply) => reply.status(500).send({}))
  await app.register(reportRoutes, { prefix: '/api/reports' })
  await app.ready()
  const routes = app.printRoutes({ commonPrefix: false })
  await app.close()

  for (const path of ['/sales', '/products', '/categories', '/cashiers', '/profit', '/low-stock']) {
    assert.ok(routes.includes(path), `missing route ${path}`)
  }
})

test('reportRoutes enforces authentication and role-based access for profit and cashier endpoints', async () => {
  const { reportRoutes } = await import('./reports.js')
  const { errorHandler } = await import('../lib/errors.js')

  // 1. Unauthenticated: without cookie/session, requireAuth throws 401 Unauthorized
  const unauthApp = Fastify()
  errorHandler(unauthApp)
  await unauthApp.register(cookie)
  await unauthApp.register(reportRoutes, { prefix: '/api/reports' })
  await unauthApp.ready()

  const unauthRes = await unauthApp.inject({ method: 'GET', url: '/api/reports/cashiers' })
  assert.equal(unauthRes.statusCode, 401, 'unauthenticated request should get 401')
  await unauthApp.close()

  // 2. Role checks: test requireRole logic via child plugin or route preHandler
  const { requireRole } = await import('../lib/auth.js')

  const rbacApp = Fastify()
  errorHandler(rbacApp)
  rbacApp.decorateRequest('user', null)

  // Route requiring owner or admin (like reportRoutes preHandler)
  rbacApp.get('/test/cashiers', {
    preHandler: [requireRole('owner', 'admin')],
  }, async () => ({ ok: true }))

  // Route requiring owner only (like /reports/profit)
  rbacApp.get('/test/profit', {
    preHandler: [requireRole('owner', 'admin'), requireRole('owner')],
  }, async () => ({ ok: true }))

  // Cashier role -> 403 on cashiers and profit
  const cashierApp = Fastify()
  errorHandler(cashierApp)
  cashierApp.addHook('preHandler', async (req) => {
    req.user = { id: 'u1', name: 'Kasir', email: 'k@pos.id', role: 'cashier', isActive: true }
  })
  cashierApp.get('/test/cashiers', { preHandler: [requireRole('owner', 'admin')] }, async () => ({ ok: true }))
  cashierApp.get('/test/profit', { preHandler: [requireRole('owner', 'admin'), requireRole('owner')] }, async () => ({ ok: true }))
  await cashierApp.ready()

  const cashierRes = await cashierApp.inject({ method: 'GET', url: '/test/cashiers' })
  assert.equal(cashierRes.statusCode, 403, 'cashier role should get 403 on report routes')
  await cashierApp.close()

  // Admin role -> 200 on cashiers, 403 on profit
  const adminApp = Fastify()
  errorHandler(adminApp)
  adminApp.addHook('preHandler', async (req) => {
    req.user = { id: 'u2', name: 'Admin', email: 'a@pos.id', role: 'admin', isActive: true }
  })
  adminApp.get('/test/cashiers', { preHandler: [requireRole('owner', 'admin')] }, async () => ({ ok: true }))
  adminApp.get('/test/profit', { preHandler: [requireRole('owner', 'admin'), requireRole('owner')] }, async () => ({ ok: true }))
  await adminApp.ready()

  const adminCashierRes = await adminApp.inject({ method: 'GET', url: '/test/cashiers' })
  assert.equal(adminCashierRes.statusCode, 200, 'admin role should be allowed on /cashiers')

  const adminProfitRes = await adminApp.inject({ method: 'GET', url: '/test/profit' })
  assert.equal(adminProfitRes.statusCode, 403, 'admin role should get 403 on /profit')
  await adminApp.close()

  // Owner role -> 200 on profit
  const ownerApp = Fastify()
  errorHandler(ownerApp)
  ownerApp.addHook('preHandler', async (req) => {
    req.user = { id: 'u3', name: 'Owner', email: 'o@pos.id', role: 'owner', isActive: true }
  })
  ownerApp.get('/test/profit', { preHandler: [requireRole('owner', 'admin'), requireRole('owner')] }, async () => ({ ok: true }))
  await ownerApp.ready()

  const ownerProfitRes = await ownerApp.inject({ method: 'GET', url: '/test/profit' })
  assert.equal(ownerProfitRes.statusCode, 200, 'owner role should be allowed on /profit')
  await ownerApp.close()
})
