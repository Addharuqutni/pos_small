import { db } from '../db/client.js'
import { auditLogs } from '../db/schema.js'

interface AuditEntry {
  actorUserId: string | null
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  ipAddress?: string
}

type AuditConnection = Pick<typeof db, 'insert'>

export async function logAudit(entry: AuditEntry, tx?: AuditConnection) {
  const conn = tx ?? db
  await conn.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    beforeJson: entry.before ?? null,
    afterJson: entry.after ?? null,
    ipAddress: entry.ipAddress ?? null,
  })
}
