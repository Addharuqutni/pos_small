const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'App.tsx'), 'utf8')

assert(source.includes("<Route element={<RouteGuard allowedRoles={['cashier']} />}>"), 'cashier routes must be cashier-only so owner/admin do not run cashier logic')

console.log('cashier route guard self-check passed')
