const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'cashier-pos-page.tsx'), 'utf8')

assert(source.includes("api.post<Sale>('/sales', payload)"), 'checkout must save sale via POST /sales')
assert(!source.includes('return api.get<Sale>(`/sales/${sale.id}`)'), 'checkout must not immediately GET sale detail after POST')
assert(source.includes('mutationFn: async (payload: {'), 'checkout mutation must keep typed payload')

console.log('cashier checkout self-check passed')
