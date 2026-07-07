const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'auth-context.tsx'), 'utf8')

assert(source.includes('useQueryClient'), 'auth context must access query client')
assert(source.includes('queryClient.clear()'), 'auth changes must clear cached cashier/session queries')

console.log('auth query cache self-check passed')
