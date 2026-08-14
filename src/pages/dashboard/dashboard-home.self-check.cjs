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

function niceChartMax(value) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const ceiling = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return ceiling * magnitude
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
assert.equal(niceChartMax(0), 1)
assert.equal(niceChartMax(1), 1)
assert.equal(niceChartMax(11), 20)
assert.equal(niceChartMax(201), 500)
assert.equal(niceChartMax(999), 1000)

console.log('dashboard-home self-check passed')
