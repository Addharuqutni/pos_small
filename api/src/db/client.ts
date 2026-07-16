import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')

// ponytail: Supabase pooler (pgbouncer) + serverless cold-start. prepare:false
// avoids prepared-statement errors over pgbouncer; idle_timeout reaps conn.
// Add ?pgbouncer=true to DATABASE_URL on the Supabase pooler URL (port 6543).
const client = postgres(connectionString, {
  prepare: false,
  idle_timeout: 20,
  max: 5,
})
export const db = drizzle(client, { schema })
