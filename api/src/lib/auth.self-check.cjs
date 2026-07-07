const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, 'auth.ts'), 'utf8')

assert(!source.includes('SESSION_CACHE_TTL_MS'), 'auth must not cache user role with TTL')
assert(!source.includes('sessionCache'), 'auth must not use in-memory session user cache')
assert(source.includes('.innerJoin(users, eq(sessions.userId, users.id))'), 'auth must read current user from database')
assert(source.includes('gt(sessions.expiresAt, new Date())'), 'auth must reject expired sessions')
assert(source.includes("if (!row.isActive) throw new Forbidden('Account deactivated')"), 'auth must check current active status')
assert(source.includes('request.user = user'), 'auth must attach current user to request')

console.log('auth session freshness self-check passed')
