const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const pos = readFileSync(join(__dirname, 'cashier-pos-page.tsx'), 'utf8')
const close = readFileSync(join(__dirname, 'shift-close-page.tsx'), 'utf8')

assert(pos.includes('Tutup shift'), 'cashier POS must show close shift control')
assert(pos.includes("navigate('/cashier/shift/close')"), 'close shift control must navigate to close page')
// Desktop top-right bar: close shift control sits before logout (mobile logout may appear earlier in source).
const desktopBarMatch = pos.match(/hidden items-center justify-end gap-3 xl:flex[\s\S]*?<\/div>/)
assert(desktopBarMatch, 'desktop top-right bar must exist')
const desktopBar = desktopBarMatch[0]
assert(desktopBar.includes('Tutup shift'), 'desktop top-right bar must include close shift control')
assert(desktopBar.includes('Keluar'), 'desktop top-right bar must include logout')
assert(
  desktopBar.indexOf('Tutup shift') < desktopBar.indexOf('Keluar'),
  'close shift control must be in top-right bar before logout',
)
assert(close.includes('useQueryClient'), 'shift close page must use query client')
assert(close.includes('queryClient.setQueryData(queryKeys.shifts.active, null)'), 'shift close success must clear active shift cache')
assert(close.includes("navigate('/cashier')"), 'shift close success must return to cashier POS')
assert(!close.includes("navigate('/login')"), 'shift close must not send cashier to login')

console.log('shift controls self-check passed')
