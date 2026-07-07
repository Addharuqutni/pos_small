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
  constructor(message = 'Bad request', issues?: unknown[]) { super(400, message, issues) }
}
export class Unauthorized extends AppError {
  constructor(message = 'Unauthorized') { super(401, message) }
}
export class Forbidden extends AppError {
  constructor(message = 'Forbidden') { super(403, message) }
}
export class NotFound extends AppError {
  constructor(message = 'Not found') { super(404, message) }
}
export class Conflict extends AppError {
  constructor(message = 'Conflict') { super(409, message) }
}
export class TooManyRequests extends AppError {
  constructor(message = 'Too many requests') { super(429, message) }
}

export async function errorHandler(app: FastifyInstance) {
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
    return reply.status(500).send({ message: 'Internal server error' })
  })
}
