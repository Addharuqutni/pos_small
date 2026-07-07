const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'reports.ts'), 'utf8')

assert(source.includes('function toCsv<T extends object>('), 'toCsv must be generic')
assert(source.includes('headers: (Extract<keyof T, string>)[]'), 'toCsv headers must be keyed by row type')
assert(source.includes('rows: T[]'), 'toCsv rows must keep inferred row type')
assert(source.includes('const escape = (v: T[Extract<keyof T, string>])'), 'toCsv escape must avoid unknown any casts')
assert(!source.includes('rows as any[]'), 'reports must not cast rows to any[] for CSV')

console.log('reports csv typing self-check passed')
