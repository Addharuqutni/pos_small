const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const sales = readFileSync(join(__dirname, 'sales-page.tsx'), 'utf8')
const reports = readFileSync(join(__dirname, 'reports-page.tsx'), 'utf8')
const home = readFileSync(join(__dirname, 'dashboard-home.tsx'), 'utf8')

for (const [name, source] of [['sales-page', sales], ['reports-page', reports], ['dashboard-home', home]]) {
  assert(source.includes('staleTime: 0'), `${name} must not use global staleTime for sales data`)
  assert(source.includes("refetchOnMount: 'always'"), `${name} must refetch sales data on mount`)
  assert(source.includes('refetchOnWindowFocus: true'), `${name} must refetch sales data on focus`)
}

console.log('transaction sync self-check passed')
