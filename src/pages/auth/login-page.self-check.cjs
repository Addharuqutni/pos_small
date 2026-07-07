const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'login-page.tsx'), 'utf8')

assert(!source.includes('to={from ?? fallback}'), 'login redirect must not blindly reuse prior path')
assert(!source.includes("navigate(from ?? '/dashboard'"), 'submit redirect must use logged-in user role')
assert(source.includes("role === 'cashier' && from?.startsWith('/cashier')"), 'cashier may return to cashier path')
assert(source.includes("role !== 'cashier' && from?.startsWith('/dashboard')"), 'owner/admin may return to dashboard path')

console.log('login redirect self-check passed')
