const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'reports-page.tsx'), 'utf8')

assert(source.includes("import { formatCurrency, formatDateOnly, localDateInputValue, localDayIso } from '@/lib/utils'"), 'reports page must import shared local date helpers')
assert(!source.includes('toISOString().slice(0, 10)'), 'reports page must not use UTC date for local report filter')
assert(!source.includes('function localDateInputValue'), 'reports page must not duplicate localDateInputValue')
assert(!source.includes('function localDayIso'), 'reports page must not duplicate localDayIso')
assert(source.includes('/reports/sales?start=${startQuery}&end=${endQuery}'), 'reports page must send ISO start/end query to API')
assert(source.includes('/api/reports/sales?start=${startQuery}&end=${endQuery}&format=csv'), 'CSV export must use same ISO start/end query')

console.log('reports page date filter self-check passed')
