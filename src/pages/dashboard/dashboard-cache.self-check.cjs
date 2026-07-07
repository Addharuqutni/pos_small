const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const saleDetail = readFileSync(join(__dirname, 'sale-detail-dashboard-page.tsx'), 'utf8')
const stock = readFileSync(join(__dirname, 'stock-page.tsx'), 'utf8')

for (const key of [
  'queryKeys.products.all',
  'queryKeys.stock.movements({})',
  'queryKeys.reports.sales()',
  'queryKeys.reports.lowStock()',
  'queryKeys.reports.shifts()',
]) {
  assert(saleDetail.includes(`queryClient.invalidateQueries({ queryKey: ${key} })`), `sale detail mutations must invalidate ${key}`)
}

for (const key of [
  'queryKeys.stock.movements({})',
  'queryKeys.products.all',
  'queryKeys.reports.lowStock()',
]) {
  assert(stock.includes(`queryClient.invalidateQueries({ queryKey: ${key} })`), `stock adjustment must invalidate ${key}`)
}

console.log('dashboard cache self-check passed')
