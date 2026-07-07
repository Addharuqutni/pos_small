import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { validate } from '../lib/validation.js'
import { requireAuth, createSession, deleteSession, cookieOptions } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { Unauthorized, TooManyRequests } from '../lib/errors.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Simple in-memory login throttle: max N attempts per (ip + email) per window.
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 60_000
interface Attempt {
  count: number
  firstAt: number
}
const loginAttempts = new Map<string, Attempt>()

function loginThrottleKey(ip: string, email: string) {
  return `${ip}:${email.toLowerCase()}`
}

function checkLoginThrottle(ip: string, email: string) {
  const key = loginThrottleKey(ip, email)
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (entry && now - entry.firstAt < LOGIN_WINDOW_MS) {
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      throw new TooManyRequests('Terlalu banyak percobaan login. Coba lagi dalam 1 menit.')
    }
    entry.count += 1
  } else {
    loginAttempts.set(key, { count: 1, firstAt: now })
  }
}

// Periodic cleanup so the map does not grow unboundedly.
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of loginAttempts) {
    if (now - entry.firstAt >= LOGIN_WINDOW_MS) loginAttempts.delete(key)
  }
}, LOGIN_WINDOW_MS).unref?.()

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post('/login', async (request, reply) => {
    const { email, password } = validate(loginSchema, request.body)

    checkLoginThrottle(request.ip, email)

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new Unauthorized('Invalid email or password')
    }
    if (!user.isActive) {
      throw new Unauthorized('Account deactivated')
    }

    // Successful login — clear throttle for this ip+email.
    loginAttempts.delete(loginThrottleKey(request.ip, email))

    const sessionId = await createSession(user.id)

    // Update last login
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))

    const secure = process.env.NODE_ENV === 'production'
    reply.setCookie('sid', sessionId, cookieOptions(secure))

    await logAudit({
      actorUserId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: request.ip,
    })

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    }
  })

  // POST /api/auth/logout
  app.post('/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const sid = request.cookies.sid
    if (sid) {
      await deleteSession(sid)
      reply.clearCookie('sid', { path: '/' })
    }

    await logAudit({
      actorUserId: request.user.id,
      action: 'logout',
      entityType: 'user',
      entityId: request.user.id,
      ipAddress: request.ip,
    })

    return { message: 'Logged out' }
  })

  // GET /api/auth/me
  app.get('/me', { preHandler: [requireAuth] }, async (request) => {
    return {
      id: request.user.id,
      name: request.user.name,
      email: request.user.email,
      role: request.user.role,
      isActive: request.user.isActive,
    }
  })
}
