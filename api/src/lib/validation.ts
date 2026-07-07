import { z } from 'zod'
import { BadRequest } from './errors.js'

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new BadRequest('Validation failed', result.error.issues)
  }
  return result.data
}

/** Validate a `:id` route param as a UUID. Returns a clean 400 instead of a raw 500 DB error. */
export function validateIdParam(params: unknown, field = 'id'): string {
  const schema = z.object({ [field]: z.string().uuid() })
  const result = schema.safeParse(params)
  if (!result.success) {
    throw new BadRequest(`${field} must be a valid UUID`)
  }
  return result.data[field] as string
}
