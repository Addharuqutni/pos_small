import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../db/schema.js'
import type { Db } from '../db/types.js'

export type TestDb = {
  db: Db
  client: PGlite
  close: () => Promise<void>
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle', 'migrations')

/**
 * SQL files drizzle-kit migrate would run: the ones listed in _journal.json, in
 * idx order. (Folders present on disk but missing from the journal are ignored,
 * exactly as the real migrator does.)
 */
function journaledMigrations(): string[] {
  const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[]
  }
  return journal.entries
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8'))
}

/** Fresh in-memory Postgres with the journaled migrations applied. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema }) as unknown as Db

  for (const sqlText of journaledMigrations()) {
    for (const statement of sqlText.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) await client.exec(trimmed)
    }
  }

  return { db, client, close: () => client.close() }
}

/** Truncates every public table so tests can share one PGlite instance. */
export async function resetTestDb(client: PGlite): Promise<void> {
  const rows = await client.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'`,
  )
  const names = rows.rows.map((r) => `"${r.tablename}"`).join(', ')
  if (names) await client.exec(`truncate ${names} restart identity cascade`)
}

/** Inserts a user and returns it. */
export async function createUser(
  db: Db,
  overrides: Partial<typeof schema.users.$inferInsert> = {},
): Promise<typeof schema.users.$inferSelect> {
  const [user] = await db.insert(schema.users).values({
    name: 'Kasir Satu',
    email: `kasir-${crypto.randomUUID()}@example.com`,
    passwordHash: 'x',
    role: 'cashier',
    ...overrides,
  }).returning()
  return user!
}

/** Inserts the single settings row used by checkout (tax config). */
export async function createSettings(
  db: Db,
  overrides: Partial<typeof schema.settings.$inferInsert> = {},
): Promise<typeof schema.settings.$inferSelect> {
  const [row] = await db.insert(schema.settings).values({ ...overrides }).returning()
  return row!
}

/** Inserts a product and returns it. */
export async function createProduct(
  db: Db,
  overrides: Partial<typeof schema.products.$inferInsert> = {},
): Promise<typeof schema.products.$inferSelect> {
  const [product] = await db.insert(schema.products).values({
    name: 'Kopi Susu',
    price: 20_000,
    stock: 10,
    ...overrides,
  }).returning()
  return product!
}

/** Inserts an open shift directly (bypassing the domain function). */
export async function createOpenShift(
  db: Db,
  cashierId: string,
  overrides: Partial<typeof schema.shifts.$inferInsert> = {},
): Promise<typeof schema.shifts.$inferSelect> {
  const [shift] = await db.insert(schema.shifts).values({
    cashierId,
    openingCash: 100_000,
    status: 'open',
    ...overrides,
  }).returning()
  return shift!
}

/** Inserts a promo and returns it. */
export async function createPromo(
  db: Db,
  overrides: Partial<typeof schema.promos.$inferInsert> = {},
): Promise<typeof schema.promos.$inferSelect> {
  const [promo] = await db.insert(schema.promos).values({
    code: `PROMO${Math.floor(Math.random() * 1e6)}`,
    name: 'Promo Uji',
    type: 'percent',
    value: 10,
    ...overrides,
  }).returning()
  return promo!
}
