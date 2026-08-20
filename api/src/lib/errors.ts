import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public issues?: unknown[],
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class BadRequest extends AppError {
  constructor(message = 'Permintaan tidak valid', issues?: unknown[]) { super(400, message, issues) }
}
export class Unauthorized extends AppError {
  constructor(message = 'Tidak terautentikasi') { super(401, message) }
}
export class Forbidden extends AppError {
  constructor(message = 'Akses ditolak') { super(403, message) }
}
export class NotFound extends AppError {
  constructor(message = 'Tidak ditemukan') { super(404, message) }
}
export class Conflict extends AppError {
  constructor(message = 'Konflik') { super(409, message) }
}
export class TooManyRequests extends AppError {
  constructor(message = 'Terlalu banyak permintaan') { super(429, message) }
}

/** Attach the app-wide error handler on the root Fastify instance (not via register). */
export function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: Error, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      })
    }
    // Fastify validation errors
    const fastifyErr = error as { statusCode?: number; validation?: unknown }
    if (fastifyErr.statusCode && fastifyErr.statusCode < 500) {
      return reply.status(fastifyErr.statusCode).send({ message: error.message })
    }
    app.log.error(error)
    return reply.status(500).send({ message: 'Kesalahan server internal' })
  })
}
