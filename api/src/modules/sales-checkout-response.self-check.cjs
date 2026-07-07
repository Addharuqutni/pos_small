const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'sales.ts'), 'utf8')

assert(source.includes('function saleWithDetails'), 'sales module must have shared sale detail builder')
assert(source.includes('return saleWithDetails(result.id)'), 'checkout must return full sale detail after transaction commits')
assert(source.includes('return saleWithDetails(id)'), 'GET /sales/:id must use same sale detail builder')
assert(source.includes('items,'), 'sale detail response must include items')
assert(source.includes('payments: paymentRows'), 'sale detail response must include payments')
assert(!source.includes('return sale!\n    })'), 'checkout must not return bare sale row')

console.log('sales checkout response self-check passed')
