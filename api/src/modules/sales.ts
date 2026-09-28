import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { validate, validateIdParam } from '../lib/validation.js'
import { paginationSchema, validateQuery } from '../lib/query-validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { checkoutSale, refundSale, voidSale } from '../domain/sale-ledger.js'
import { listSales, saleDetailForActor } from '../domain/sale-query.js'

// --- Schemas ---

const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1),
  discount: z.number().int().min(0).optional(),
})

const paymentSchema = z.object({
  method: z.enum(['cash', 'qris', 'transfer']),
  amount: z.number().int().min(0),
  referenceNo: z.string().max(255).nullable().optional(),
})

const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1),
  payments: z.array(paymentSchema).min(1),
  discount: z.number().int().min(0).optional(), // manual sale-level discount
  promoCode: z.string().trim().max(50).optional(),
})

const refundSchema = z.object({
  reason: z.string().min(1),
  items: z.array(
    z.object({
      saleItemId: z.string().uuid(),
      qty: z.number().int().min(1),
    }),
  ).min(1),
})

// GET /api/sales query params
const listQuerySchema = paginationSchema.extend({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  status: z.enum(['paid', 'void', 'refunded', 'partial_refunded']).optional(),
  q: z.string().trim().optional(),
})

export async function saleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // POST /api/sales — atomic checkout
  app.post('/', async (request, reply) => {
    const body = validate(checkoutSchema, request.body)
    const { saleId } = await checkoutSale(
      db,
      { id: request.user.id, role: request.user.role, ipAddress: request.ip },
      body,
    )

    reply.status(201)
    return saleDetailForActor(db, request.user, saleId)
  })

  // GET /api/sales — cashiers see only their own sales
  app.get('/', async (request) => {
    const { page, limit, start, end, status, q } = validateQuery(listQuerySchema, request.query)
    return listSales(db, request.user, { page: page!, limit: limit!, start, end, status, q })
  })

  // GET /api/sales/:id — other cashiers' sales are a 404
  app.get('/:id', async (request) => {
    const id = validateIdParam(request.params)
    return saleDetailForActor(db, request.user, id)
  })

  // POST /api/sales/:id/void — same-day full cancellation (owner/admin)
  app.post('/:id/void', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const id = validateIdParam(request.params)
    await voidSale(db, { id: request.user.id, role: request.user.role, ipAddress: request.ip }, id)
    return { message: 'Transaksi dibatalkan' }
  })

  // POST /api/sales/:id/refund — owner/admin
  app.post('/:id/refund', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const id = validateIdParam(request.params)
    const body = validate(refundSchema, request.body)
    return refundSale(db, { id: request.user.id, role: request.user.role, ipAddress: request.ip }, id, body)
  })
}
