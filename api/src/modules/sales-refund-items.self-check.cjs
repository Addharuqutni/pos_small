const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'sales.ts'), 'utf8')

assert(source.includes('type RefundItemRow = typeof refundItems.$inferSelect'), 'sales must infer refund item row type')
assert(source.includes('let refundItemRows: RefundItemRow[] = []'), 'refund item rows must use inferred type')
assert(!source.includes('let refundItemRows: any[]'), 'refund item rows must not use any[]')

console.log('sales refund item typing self-check passed')
