import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import {
  users, sessions, categories, products, shifts, sales, saleItems,
  payments, refunds, refundItems, stockMovements, settings, auditLogs,
  promos, suppliers, purchases, purchaseItems,
} from '../db/schema.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'

// Table order respects foreign keys for painless restore.
const TABLES = [
  ['settings', settings],
  ['categories', categories],
  ['products', products],
  ['users', users],
  ['sessions', sessions],
  ['promos', promos],
  ['suppliers', suppliers],
  ['shifts', shifts],
  ['sales', sales],
  ['sale_items', saleItems],
  ['payments', payments],
  ['refunds', refunds],
  ['refund_items', refundItems],
  ['purchases', purchases],
  ['purchase_items', purchaseItems],
  ['stock_movements', stockMovements],
  ['audit_logs', auditLogs],
] as const

export async function backupRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)
  app.addHook('preHandler', requireRole('owner'))

  // GET /api/backup — full JSON dump
  app.get('/', async (request, reply) => {
    const dump: { exportedAt: string; data: Record<string, unknown[]> } = { exportedAt: new Date().toISOString(), data: {} }
    for (const [name, table] of TABLES) {
      dump.data[name] = await db.select().from(table)
    }

    await logAudit({
      actorUserId: request.user.id,
      action: 'export_backup',
      entityType: 'backup',
      entityId: 'full',
      ipAddress: request.ip,
    })

    const timestamp = new Date().toISOString().slice(0, 10)
    reply.header('Content-Type', 'application/json')
    reply.header('Content-Disposition', `attachment; filename="pos-backup-${timestamp}.json"`)
    return dump
  })
}
