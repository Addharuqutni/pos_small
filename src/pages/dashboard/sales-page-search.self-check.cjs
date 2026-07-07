const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'sales-page.tsx'), 'utf8')

assert(source.includes("import { useState, type FormEvent } from 'react'"), 'sales page must import useState and FormEvent')
assert(source.includes("const [searchInput, setSearchInput] = useState('')"), 'sales page must track input value')
assert(source.includes("const [search, setSearch] = useState('')"), 'sales page must track submitted search')
assert(source.includes('function handleSearch(event: FormEvent<HTMLFormElement>)'), 'sales page must handle form submit')
assert(source.includes('setSearch(searchInput.trim())'), 'sales page must submit trimmed search')
assert(source.includes("queryKeys.sales.list({ q: search || undefined })"), 'sales query key must include submitted search')
assert(source.includes("const salesPath = search ? `/sales?q=${encodeURIComponent(search)}` : '/sales'"), 'sales request must include encoded q only when search exists')
assert(source.includes("placeholder=\"Cari invoice atau kasir...\""), 'search input placeholder must match spec')
assert(source.includes('>Cari</button>'), 'search button must exist')
assert(source.includes("{search ? 'Transaksi tidak ditemukan' : 'Belum ada transaksi'}"), 'empty state must change when search active')

console.log('sales page search self-check passed')
