const assert = require('node:assert/strict')

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDayIso(date, endOfDay = false) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )
  return value.toISOString()
}

function lastSevenDays(today = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (6 - index))
    return localDateInputValue(day)
  })
}

function barHeight(value, max) {
  if (value <= 0 || max <= 0) return 8
  return Math.max(8, Math.round((value / max) * 100))
}

assert.equal(localDateInputValue(new Date(2026, 6, 2, 23, 30)), '2026-07-02')
assert.equal(new Date(localDayIso('2026-07-02')).getFullYear(), 2026)
assert.equal(new Date(localDayIso('2026-07-02')).getHours(), 0)
assert.equal(new Date(localDayIso('2026-07-02', true)).getHours(), 23)
assert.equal(new Date(localDayIso('2026-07-02', true)).getMilliseconds(), 999)
assert.deepEqual(lastSevenDays(new Date(2026, 6, 2)), [
  '2026-06-26',
  '2026-06-27',
  '2026-06-28',
  '2026-06-29',
  '2026-06-30',
  '2026-07-01',
  '2026-07-02',
])
assert.equal(barHeight(0, 0), 8)
assert.equal(barHeight(0, 100), 8)
assert.equal(barHeight(50, 100), 50)
assert.equal(barHeight(1, 100), 8)
assert.equal(barHeight(100, 100), 100)

console.log('dashboard-home self-check passed')
