import type { Db } from '../db/types.js'
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

/** Row-writer accepted by logAudit: the db handle, or the tx handle from db.transaction. */
type AuditConnection = Pick<Db, 'insert'>

export async function logAudit(entry: AuditEntry, conn: AuditConnection) {
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
