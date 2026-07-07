import {
  pgTable, uuid, varchar, text, integer, boolean, timestamp,
  uniqueIndex, index, check, jsonb, pgEnum,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// --- Enums ---

export const roleEnum = pgEnum('role', ['owner', 'admin', 'cashier'])
export const saleStatusEnum = pgEnum('sale_status', ['paid', 'void', 'refunded', 'partial_refunded'])
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'qris', 'transfer'])
export const shiftStatusEnum = pgEnum('shift_status', ['open', 'closed'])
export const stockMovementTypeEnum = pgEnum('stock_movement_type', ['sale', 'adjustment', 'return', 'restock', 'refund'])

// --- Users ---

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('cashier'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_idx').on(t.email),
])

// --- Sessions ---

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('sessions_user_id_idx').on(t.userId),
  index('sessions_expires_at_idx').on(t.expiresAt),
])

// --- Categories ---

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('categories_is_active_idx').on(t.isActive),
])

// --- Products ---

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  barcode: varchar('barcode', { length: 100 }),
  categoryId: uuid('category_id').references(() => categories.id),
  imageData: text('image_data'),
  price: integer('price').notNull().default(0),
  costPrice: integer('cost_price').notNull().default(0),
  stock: integer('stock').notNull().default(0),
  minStock: integer('min_stock').notNull().default(0),
  trackStock: boolean('track_stock').notNull().default(true),
  allowNegativeStock: boolean('allow_negative_stock').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('products_name_idx').on(t.name),
  index('products_is_active_idx').on(t.isActive),
  uniqueIndex('products_sku_idx')
    .on(t.sku)
    .where(sql`sku IS NOT NULL AND sku != ''`),
  uniqueIndex('products_barcode_idx')
    .on(t.barcode)
    .where(sql`barcode IS NOT NULL AND barcode != ''`),
  check('products_price_check', sql`price >= 0`),
  check('products_cost_price_check', sql`cost_price >= 0`),
])

// --- Shifts ---

export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  cashierId: uuid('cashier_id').notNull().references(() => users.id),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  openingCash: integer('opening_cash').notNull().default(0),
  closingCash: integer('closing_cash'),
  expectedCash: integer('expected_cash'),
  difference: integer('difference'),
  status: shiftStatusEnum('status').notNull().default('open'),
}, (t) => [
  index('shifts_cashier_id_idx').on(t.cashierId),
  index('shifts_status_idx').on(t.status),
  // One open shift per cashier
  uniqueIndex('shifts_one_open_per_cashier_idx')
    .on(t.cashierId)
    .where(sql`status = 'open'`),
  check('shifts_opening_cash_check', sql`opening_cash >= 0`),
])

// --- Sales ---

export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceNo: varchar('invoice_no', { length: 50 }).notNull(),
  cashierId: uuid('cashier_id').notNull().references(() => users.id),
  shiftId: uuid('shift_id').notNull().references(() => shifts.id),
  subtotal: integer('subtotal').notNull().default(0),
  discountTotal: integer('discount_total').notNull().default(0),
  taxTotal: integer('tax_total').notNull().default(0),
  grandTotal: integer('grand_total').notNull().default(0),
  paidTotal: integer('paid_total').notNull().default(0),
  changeTotal: integer('change_total').notNull().default(0),
  status: saleStatusEnum('status').notNull().default('paid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sales_invoice_no_idx').on(t.invoiceNo),
  index('sales_cashier_id_idx').on(t.cashierId),
  index('sales_shift_id_idx').on(t.shiftId),
  index('sales_status_idx').on(t.status),
  index('sales_created_at_idx').on(t.createdAt),
  check('sales_subtotal_check', sql`subtotal >= 0`),
  check('sales_grand_total_check', sql`grand_total >= 0`),
])

// --- Sale Items ---

export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  productNameSnapshot: varchar('product_name_snapshot', { length: 255 }).notNull(),
  qty: integer('qty').notNull(),
  price: integer('price').notNull(),
  discount: integer('discount').notNull().default(0),
  subtotal: integer('subtotal').notNull(),
}, (t) => [
  index('sale_items_sale_id_idx').on(t.saleId),
  check('sale_items_qty_check', sql`qty > 0`),
  check('sale_items_price_check', sql`price >= 0`),
  check('sale_items_discount_check', sql`discount >= 0`),
  check('sale_items_subtotal_check', sql`subtotal >= 0`),
])

// --- Payments ---

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  method: paymentMethodEnum('method').notNull(),
  amount: integer('amount').notNull(),
  referenceNo: varchar('reference_no', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('payments_sale_id_idx').on(t.saleId),
  check('payments_amount_check', sql`amount >= 0`),
])

// --- Refunds ---

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id),
  reason: text('reason').notNull(),
  refundedBy: uuid('refunded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('refunds_sale_id_idx').on(t.saleId),
])

// --- Refund Items ---

export const refundItems = pgTable('refund_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  refundId: uuid('refund_id').notNull().references(() => refunds.id, { onDelete: 'cascade' }),
  saleItemId: uuid('sale_item_id').notNull().references(() => saleItems.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  qty: integer('qty').notNull(),
  amount: integer('amount').notNull(),
}, (t) => [
  index('refund_items_refund_id_idx').on(t.refundId),
  check('refund_items_qty_check', sql`qty > 0`),
  check('refund_items_amount_check', sql`amount >= 0`),
])

// --- Stock Movements ---

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id),
  type: stockMovementTypeEnum('type').notNull(),
  qtyChange: integer('qty_change').notNull(),
  stockBefore: integer('stock_before').notNull(),
  stockAfter: integer('stock_after').notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('stock_movements_product_id_idx').on(t.productId),
  index('stock_movements_created_at_idx').on(t.createdAt),
])

// --- Settings ---

export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeName: varchar('store_name', { length: 255 }).notNull().default('Toko Saya'),
  storeAddress: text('store_address').notNull().default(''),
  storePhone: varchar('store_phone', { length: 50 }).notNull().default(''),
  receiptFooter: text('receipt_footer').notNull().default('Terima kasih atas kunjungan Anda'),
  taxEnabled: boolean('tax_enabled').notNull().default(false),
  taxRate: integer('tax_rate').notNull().default(0), // percentage (e.g. 11 = 11%)
  currency: varchar('currency', { length: 10 }).notNull().default('IDR'),
  allowNegativeStockDefault: boolean('allow_negative_stock_default').notNull().default(false),
})

// --- Audit Logs ---

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }).notNull(),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_logs_created_at_idx').on(t.createdAt),
  index('audit_logs_actor_user_id_idx').on(t.actorUserId),
  index('audit_logs_entity_idx').on(t.entityType, t.entityId),
])
