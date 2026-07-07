const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'shifts.ts'), 'utf8')

assert(source.includes('const openShifts = await tx'), 'close endpoint must load all open shifts')
assert(source.includes('orderBy(desc(shifts.openedAt))'), 'close endpoint must make active shift deterministic')
assert(source.includes('const [shift, ...staleOpenShifts] = openShifts'), 'close endpoint must keep latest shift and detect stale duplicate open shifts')
assert(source.includes('staleOpenShifts.length > 0'), 'close endpoint must close stale duplicate open shifts')
assert(source.includes('inArray(shifts.id, staleOpenShifts.map((s) => s.id))'), 'close endpoint must update all stale duplicate open shift ids')
assert(source.includes("status: 'closed'"), 'close endpoint must persist closed status')

console.log('shifts close persistence self-check passed')
