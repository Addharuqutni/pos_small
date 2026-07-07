const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'sales.ts'), 'utf8')

assert(source.includes('inArray'), 'sales checkout should use drizzle inArray for product id list')
assert(!source.includes('= ANY(${productIds})'), 'sales checkout must not interpolate JS array into raw SQL ANY')
assert(!source.includes('= ANY(${refundRows.map((r) => r.id)})'), 'sale detail must not interpolate refund id array into raw SQL ANY')
assert(source.includes('inArray(refundItems.refundId, refundIds)'), 'sale detail should use drizzle inArray for refund item ids')

console.log('sales checkout query self-check passed')
