import { z } from 'zod'
import { validate } from './validation.js'

/**
 * Escape SQL LIKE wildcards (%, _) and backslash from a user-supplied search
 * string so it is treated as a literal fragment inside an ILIKE pattern.
 * The resulting string is meant to be wrapped with `%` on both sides.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

/** Coerce a "true"/"false" (or "1"/"0") query string into a boolean. */
const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .or(z.boolean())
  .transform((v) => v === true || v === 'true' || v === '1')

/** Pagination params shared across list endpoints. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const booleanParamSchema = z.object({
  active: booleanString.optional(),
})

export type PaginationParams = z.infer<typeof paginationSchema>

/**
 * Validate a Fastify `request.query` object against a Zod schema.
 * Returns the parsed (and defaulted/transformed) value.
 */
export function validateQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
  return validate(schema, query)
}
