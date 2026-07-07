import type { FastifyReply, FastifyRequest } from 'fastify'
import { eq, and, gt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import { Unauthorized, Forbidden } from './errors.js'

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// In-memory session cache — avoids a DB round-trip on every authenticated request.
// Entries are short-lived (60s) so deactivation / logout propagates quickly.
const SESSION_CACHE_TTL_MS = 60_000
interface CachedSession {
  user: AuthUser
  expiresAt: number // wall-clock ms when this cache entry expires
}
const sessionCache = new Map<string, CachedSession>()

function readCachedSession(sid: string): AuthUser | null {
  const hit = sessionCache.get(sid)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    sessionCache.delete(sid)
    return null
  }
  return hit.user
}

function invalidateSession(sid: string) {
  sessionCache.delete(sid)
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'cashier'
  isActive: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser
  }
}

export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000,
  }
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS)
  const [session] = await db.insert(sessions).values({ userId, expiresAt }).returning({ id: sessions.id })
  return session!.id
}

export async function deleteSession(sessionId: string) {
  invalidateSession(sessionId)
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const sid = request.cookies.sid
  if (!sid) throw new Unauthorized()

  // Fast path — serve from cache when available.
  const cached = readCachedSession(sid)
  if (cached) {
    request.user = cached
    return
  }

  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())))
    .limit(1)

  if (!row) throw new Unauthorized()
  if (!row.isActive) throw new Forbidden('Account deactivated')

  const user: AuthUser = {
    id: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
  }

  sessionCache.set(sid, { user, expiresAt: Date.now() + SESSION_CACHE_TTL_MS })
  request.user = user
}

export function requireRole(...roles: AuthUser['role'][]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // requireAuth must run before this
    if (!request.user) throw new Unauthorized()
    if (!roles.includes(request.user.role)) {
      throw new Forbidden('Insufficient permissions')
    }
  }
}
