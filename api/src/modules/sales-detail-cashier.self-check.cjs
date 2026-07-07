const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'sales.ts'), 'utf8')

assert(source.includes('users,') || source.includes('users }'), 'sales module must import users schema')
assert(source.includes('cashier: {'), 'sale detail response must include cashier object')
assert(source.includes('cashierRows.find'), 'sale detail must map cashier data from users table')
assert(source.includes('eq(users.id, sale.cashierId)'), 'sale detail must query user matching sale cashierId')
assert(source.includes('cashierMap'), 'sales list must map cashier data from users table')
assert(source.includes('cashier: cashierMap.get(row.cashierId) ?? null'), 'sales list rows must include cashier object')

console.log('sales detail cashier self-check passed')
