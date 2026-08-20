import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { localDateInputValue, localDayIso, formatDateOnly } from './utils.ts'

test('localDateInputValue formats local date for native inputs', () => {
  assert.equal(localDateInputValue(new Date(2026, 7, 19)), '2026-08-19')
  assert.equal(localDateInputValue(new Date(2026, 0, 3)), '2026-01-03')
})

test('localDayIso maps a local day to UTC bounds', () => {
  assert.equal(localDayIso('2026-08-19'), '2026-08-18T17:00:00.000Z')
  assert.equal(localDayIso('2026-08-19', true), '2026-08-19T16:59:59.999Z')
})

test('formatDateOnly parses yyyy-mm-dd without UTC shift', () => {
  // 2026-08-19 in Asia/Jakarta stays 19 Agustus 2026.
  assert.match(formatDateOnly('2026-08-19'), /19 Agu 2026/)
})
