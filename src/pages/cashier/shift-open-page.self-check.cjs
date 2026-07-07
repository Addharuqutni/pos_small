const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'shift-open-page.tsx'), 'utf8')

assert(source.includes('useQueryClient'), 'opening shift must access query client')
assert(source.includes('queryClient.setQueryData(queryKeys.shifts.active'), 'opening shift must update active shift cache before returning to POS')

console.log('shift open cache self-check passed')
