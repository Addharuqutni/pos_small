const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'shift-close-page.tsx'), 'utf8')

assert(!source.includes('alert('), 'close shift success must not use javascript alert popup')
assert(source.includes("import { ApiError, api } from '@/lib/api'"), 'close page must import ApiError')
assert(source.includes('err instanceof ApiError && err.status === 404'), 'active shift query must handle 404 as no active shift')
assert(source.includes('return null'), 'active shift 404 handler must return null')
assert(source.includes('retry: false'), 'active shift query must not retry no-shift 404')
assert(source.includes('setClosedShift('), 'close shift success must store closed shift result for inline UI')
assert(source.includes('Transaksi shift selesai'), 'close shift success must show inline success state')

console.log('shift close self-check passed')
