import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import Fastify from 'fastify'

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
  app.setErrorHandler((_error, _request, reply) => reply.status(500).send({}))
  await app.register(reportRoutes, { prefix: '/api/reports' })
  await app.ready()
  const routes = app.printRoutes({ commonPrefix: false })
  await app.close()

  for (const path of ['/sales', '/products', '/categories', '/cashiers', '/profit', '/low-stock']) {
    assert.ok(routes.includes(path), `missing route ${path}`)
  }
})
