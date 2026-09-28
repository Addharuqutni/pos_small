import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schema from './schema.js'

/** Full schema object passed to `drizzle(client, { schema })`. */
export type DbSchema = typeof schema

/**
 * Database handle accepted by domain functions. Satisfied by any drizzle Postgres
 * driver — postgres-js in production, PGlite in tests — and by the `tx` handle
 * passed to `db.transaction(callback)`.
 */
export type Db = PgDatabase<PgQueryResultHKT, DbSchema>
