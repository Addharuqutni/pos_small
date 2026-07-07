const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'shift-report-page.tsx'), 'utf8')

assert(source.includes('queryKeys.reports.shifts()'), 'shift report must use reports.shifts query key')
assert(source.includes('staleTime: 0'), 'shift report must not use global staleTime')
assert(source.includes("refetchOnMount: 'always'"), 'shift report must refetch on mount')
assert(source.includes('refetchOnWindowFocus: true'), 'shift report must refetch when owner returns to dashboard')
assert(source.includes('const visibleShifts ='), 'shift report must derive visible shifts')
assert(source.includes('hasNewerShift'), 'shift report must detect stale open rows with newer shifts')
assert(source.includes("s.status === 'open'"), 'shift report must inspect open shift rows')
assert(source.includes('visibleShifts?.map'), 'shift report table must render filtered visible shifts')
assert(source.includes('visibleShifts?.length === 0'), 'empty state must use filtered visible shifts')

console.log('shift report self-check passed')
