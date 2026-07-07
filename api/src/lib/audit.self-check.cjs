const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const apiRoot = join(__dirname, '..')
const audit = readFileSync(join(apiRoot, 'lib', 'audit.ts'), 'utf8')
const sales = readFileSync(join(apiRoot, 'modules', 'sales.ts'), 'utf8')
const stock = readFileSync(join(apiRoot, 'modules', 'stock.ts'), 'utf8')

assert(audit.includes("type AuditConnection = Pick<typeof db, 'insert'>"), 'audit must use transaction-compatible insert type')
assert(audit.includes('tx?: AuditConnection'), 'logAudit must accept typed transaction-compatible connection')
assert(!audit.includes("import type { Db }"), 'audit must not import Db-only type')
assert(!sales.includes('tx as any'), 'sales module must not cast transactions to any for audit')
assert(!stock.includes('tx as any'), 'stock module must not cast transactions to any for audit')

console.log('audit typing self-check passed')
