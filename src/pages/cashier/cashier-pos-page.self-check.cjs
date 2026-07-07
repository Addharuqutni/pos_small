const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'cashier-pos-page.tsx'), 'utf8')

assert(!source.includes('enabled: debouncedSearch.length > 0'), 'cashier products must load before search')
assert(!source.includes('debouncedSearch && products?.data'), 'cashier product grid must render without search text')
assert(source.includes('queryClient.invalidateQueries({ queryKey: queryKeys.products.all })'), 'checkout must refresh product stock cache')
assert(source.includes('queryClient.invalidateQueries({ queryKey: queryKeys.sales.all })'), 'checkout must refresh sales cache')
assert(source.includes('queryClient.invalidateQueries({ queryKey: queryKeys.reports.sales() })'), 'checkout must refresh sales report cache')
assert(source.includes('queryClient.invalidateQueries({ queryKey: queryKeys.reports.lowStock() })'), 'checkout must refresh low-stock report cache')
assert(source.includes('queryClient.invalidateQueries({ queryKey: queryKeys.reports.shifts() })'), 'checkout must refresh shift report cache')

console.log('cashier product list and checkout invalidation self-check passed')
