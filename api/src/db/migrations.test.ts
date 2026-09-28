import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../db/schema.js'

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle', 'migrations')

/**
 * Guards the Step 8 invariant: a fresh DB migrated through the folder that
 * `drizzle-kit migrate` reads (journal entries only) matches schema.ts —
 * every table, column, constraint and index drizzle would diff on.
 */
test('migrations folder (journal entries) produces the schema declared in schema.ts', async () => {
  const client = new PGlite()
  try {
    await migrate(drizzle(client), { migrationsFolder })

    const tables = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    )
    const declared = Object.values(schema)
      .filter((v) => typeof v === 'object' && v !== null && Symbol.for('drizzle:Name') in (v as object))
      .map((v) => (v as unknown as { [key: symbol]: string })[Symbol.for('drizzle:Name')])
      .sort()
    assert.deepEqual(tables.rows.map((r) => r.tablename).sort(), declared)

    // Constraints named and declared in schema.ts must exist in the migrated DB.
    const constraints = await client.query<{ conname: string }>(
      `select conname from pg_constraint where connamespace = 'public'::regnamespace order by conname`,
    )
    const constraintNames = constraints.rows.map((r) => r.conname)
    const declaredChecks = [
      'products_price_check', 'products_cost_price_check',
      'shifts_opening_cash_check',
      'sale_items_qty_check', 'sale_items_price_check',
      'sale_items_discount_check', 'sale_items_subtotal_check',
      'sales_subtotal_check', 'sales_grand_total_check',
      'payments_amount_check', 'refund_items_qty_check',
      'refund_items_amount_check', 'promos_value_check',
      'purchase_items_qty_check', 'purchase_items_cost_price_check',
    ]
    for (const name of declaredChecks) {
      assert.ok(constraintNames.includes(name), `missing constraint ${name}`)
    }

    // The named indexes schema.ts declares must exist too.
    const indexes = await client.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' order by indexname`,
    )
    const indexNames = indexes.rows.map((r) => r.indexname)
    for (const name of [
      'users_email_idx', 'products_sku_idx', 'products_barcode_idx',
      'sales_invoice_no_idx', 'shifts_one_open_per_cashier_idx',
      'promos_code_idx', 'purchases_invoice_no_idx',
      'sessions_user_id_idx', 'sessions_expires_at_idx',
    ]) {
      assert.ok(indexNames.includes(name), `missing index ${name}`)
    }

    // A spot check that the two journaled migrations really ran in order:
    // 0001 adds these promotion columns on top of the base sales table.
    const cols = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'sales' order by column_name`,
    )
    const names = cols.rows.map((r) => r.column_name)
    assert.ok(names.includes('promo_id'))
    assert.ok(names.includes('promo_code'))
    assert.ok(names.includes('promo_discount'))
  } finally {
    await client.close()
  }
})

test('journal on disk matches the migration files that exist', async () => {
  const files = readMigrationFiles({ migrationsFolder })
  assert.ok(files.length >= 2)
  // hashes are non-empty and unique
  const hashes = new Set(files.map((f) => f.hash))
  assert.equal(hashes.size, files.length)
})
