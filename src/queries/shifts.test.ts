import { test, afterEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { ApiError } from '../lib/api.ts'
import { fetchActiveShift } from './shifts.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function stubFetch(response: { ok: boolean; status: number; body?: unknown }) {
  globalThis.fetch = (async () => ({
    ok: response.ok,
    status: response.status,
    statusText: String(response.status),
    json: async () => response.body,
  })) as unknown as typeof fetch
}

test('an open shift is returned as-is', async () => {
  const shift = { id: 'shift-1', status: 'open', openingCash: 100_000 }
  stubFetch({ ok: true, status: 200, body: shift })
  assert.deepEqual(await fetchActiveShift(), shift)
})

test('404 means no open shift — null instead of an error', async () => {
  stubFetch({ ok: false, status: 404, body: { message: 'Tidak ada shift aktif' } })
  assert.equal(await fetchActiveShift(), null)
})

test('other failures still reject so the UI can show them', async () => {
  stubFetch({ ok: false, status: 500, body: { message: 'Boom' } })
  await assert.rejects(fetchActiveShift, (err: unknown) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.status, 500)
    assert.equal(err.message, 'Boom')
    return true
  })
})
