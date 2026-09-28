import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Db } from '../db/types.js'
import {
  sales, saleItems, payments, products,
  stockMovements, refunds, refundItems, settings, users, promos,
} from '../db/schema.js'
import { logAudit } from '../lib/audit.js'
import { NotFound, BadRequest } from '../lib/errors.js'
import { priceSale, getRefundQuantityError, refundLineAmount } from '../lib/sale-pricing.js'
import { currentShiftFor } from './shift.js'
import { findEligiblePromo, type PromoRow } from './promo.js'

/** Authenticated caller performing the operation. */
export interface SaleActor {
  id: string
  role: 'owner' | 'admin' | 'cashier'
  /** Client IP, recorded on audit rows. */
  ipAddress?: string
}

export interface CheckoutPaymentInput {
  method: 'cash' | 'qris' | 'transfer'
  amount: number
  referenceNo?: string | null
}

export interface CheckoutItemInput {
  productId: string
  qty: number
  discount?: number
}

export interface CheckoutInput {
  items: CheckoutItemInput[]
  payments: CheckoutPaymentInput[]
  /** Manual sale-level discount. */
  discount?: number
  promoCode?: string
}

export interface RefundInput {
  reason: string
  items: { saleItemId: string; qty: number }[]
}

export interface VoidInput {
  /** Clock override for "same Jakarta day" checks (tests). */
  now?: Date
}

export interface SaleWithDetails {
  id: string
  invoiceNo: string
  cashierId: string
  shiftId: string
  subtotal: number
  discountTotal: number
  taxTotal: number
  grandTotal: number
  paidTotal: number
  changeTotal: number
  discount: number
  promoId: string | null
  promoCode: string | null
  promoDiscount: number
  status: 'paid' | 'void' | 'refunded' | 'partial_refunded'
  createdAt: Date
  updatedAt: Date
  cashier: {
    id: string; name: string; email: string; role: string; isActive: boolean
  } | null
  items: (typeof saleItems.$inferSelect)[]
  payments: (typeof payments.$inferSelect)[]
  refunds: ((typeof refunds.$inferSelect) & { items: (typeof refundItems.$inferSelect)[] })[]
}

function generateInvoiceNo(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  return `INV-${date}-${nanoid(6).toUpperCase()}`
}

/**
 * The calendar date (YYYY-MM-DD) a timestamp falls on in the store's business
 * timezone, Asia/Jakarta (UTC+7, no DST). Uses Intl so it works on any Postgres.
 */
function businessDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Loads a sale with items, payments, refunds (with their items) and cashier. */
export async function getSaleWithDetails(db: Db, saleId: string): Promise<SaleWithDetails> {
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1)
  if (!sale) throw new NotFound('Transaksi tidak ditemukan')

  const [items, paymentRows, refundRows, cashierRows] = await Promise.all([
    db.select().from(saleItems).where(eq(saleItems.saleId, saleId)),
    db.select().from(payments).where(eq(payments.saleId, saleId)),
    db.select().from(refunds).where(eq(refunds.saleId, saleId)),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, sale.cashierId))
      .limit(1),
  ])

  const refundItemRows = refundRows.length > 0
    ? await db.select().from(refundItems).where(inArray(refundItems.refundId, refundRows.map((r) => r.id)))
    : []

  const cashier = cashierRows.find((u) => u.id === sale.cashierId) ?? null

  return {
    ...sale,
    cashier,
    items,
    payments: paymentRows,
    refunds: refundRows.map((r) => ({
      ...r,
      items: refundItemRows.filter((ri) => ri.refundId === r.id),
    })),
  }
}

/**
 * Atomic checkout: validates products/stock/promo, prices the whole cart via
 * priceSale, then writes the sale, items, payments, promo usage, stock movements
 * and the audit row in one transaction.
 */
export async function checkoutSale(db: Db, actor: SaleActor, input: CheckoutInput): Promise<{ saleId: string }> {
  // Load settings for tax
  const [storeSettings] = await db.select().from(settings).limit(1)
  const taxEnabled = storeSettings?.taxEnabled ?? false
  const taxRate = storeSettings?.taxRate ?? 0

  const saleId = await db.transaction(async (tx) => {
    // The cashier must have an open shift; lock it so a concurrent close cannot
    // race the checkout.
    const shift = await currentShiftFor(tx, actor.id, { lock: true })
    if (!shift) throw new BadRequest('Shift belum dibuka')

    // 1. Lock and validate products
    const productIds = input.items.map((i) => i.productId)
    const lockedProducts = await tx
      .select()
      .from(products)
      .where(inArray(products.id, productIds))
      .for('update')

    const productMap = new Map(lockedProducts.map((p) => [p.id, p]))

    for (const item of input.items) {
      const product = productMap.get(item.productId)
      if (!product) throw new NotFound(`Produk ${item.productId} tidak ditemukan`)
      if (!product.isActive) throw new BadRequest(`Produk "${product.name}" tidak aktif`)
      if (product.trackStock && !product.allowNegativeStock && product.stock < item.qty) {
        throw new BadRequest(`Stok tidak cukup untuk "${product.name}": tersedia ${product.stock}, dibutuhkan ${item.qty}`)
      }
    }

    // 2. Resolve promo eligibility (DB state); discount math happens in priceSale
    // minPurchase is enforced by priceSale below, which reports it as a BadRequest.
    let promo: PromoRow | null = null
    if (input.promoCode) {
      promo = await findEligiblePromo(tx, input.promoCode, { lock: true, onError: BadRequest })
    }

    // 3. Calculate totals (server-side, ignore client totals)
    const pricing = priceSale({
      lines: input.items.map((item) => {
        const product = productMap.get(item.productId)!
        return {
          price: product.price,
          qty: item.qty,
          discount: item.discount ?? 0,
          name: product.name,
        }
      }),
      promo: promo
        ? {
            type: promo.type,
            value: promo.value,
            maxDiscount: promo.maxDiscount,
            minPurchase: promo.minPurchase,
          }
        : null,
      saleDiscount: input.discount ?? 0,
      taxRate: taxEnabled ? taxRate : 0,
      paid: input.payments.reduce((sum, p) => sum + p.amount, 0),
    })

    // Errors are ordered exactly as the pre-refactor checks threw them.
    const blocking = pricing.errors[0]
    if (blocking) throw new BadRequest(blocking.message)

    const {
      subtotal, promoDiscount, saleDiscount, taxTotal,
      grandTotal, discountTotal, paidTotal, changeTotal,
    } = pricing

    const saleItemValues = input.items.map((item, index) => ({
      productId: item.productId,
      productNameSnapshot: productMap.get(item.productId)!.name,
      qty: item.qty,
      price: productMap.get(item.productId)!.price,
      discount: item.discount ?? 0,
      subtotal: pricing.lines[index]!.net,
    }))

    const invoiceNo = generateInvoiceNo()

    // 4. Insert sale
    const [sale] = await tx.insert(sales).values({
      invoiceNo,
      cashierId: actor.id,
      shiftId: shift.id,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      paidTotal,
      changeTotal,
      discount: saleDiscount,
      promoId: promo?.id ?? null,
      promoCode: promo?.code ?? null,
      promoDiscount,
      status: 'paid',
    }).returning()

    if (promo) {
      await tx.update(promos).set({ usageCount: promo.usageCount + 1, updatedAt: new Date() }).where(eq(promos.id, promo.id))
    }

    // 5. Insert sale items
    const insertedItems = await tx.insert(saleItems).values(
      saleItemValues.map((v) => ({ ...v, saleId: sale!.id })),
    ).returning()

    // 6. Insert payments
    await tx.insert(payments).values(
      input.payments.map((p) => ({
        saleId: sale!.id,
        method: p.method,
        amount: p.amount,
        referenceNo: p.referenceNo ?? null,
      })),
    )

    // 7. Decrement stock + insert stock movements
    for (const item of input.items) {
      const product = productMap.get(item.productId)!
      if (product.trackStock) {
        const newStock = product.stock - item.qty
        await tx
          .update(products)
          .set({ stock: newStock, updatedAt: new Date() })
          .where(eq(products.id, item.productId))

        await tx.insert(stockMovements).values({
          productId: item.productId,
          type: 'sale',
          qtyChange: -item.qty,
          stockBefore: product.stock,
          stockAfter: newStock,
          referenceType: 'sale',
          referenceId: sale!.id,
          createdBy: actor.id,
        })
      }
    }

    // 8. Audit
    await logAudit({
      actorUserId: actor.id,
      action: 'create_sale',
      entityType: 'sale',
      entityId: sale!.id,
      after: { ...sale, items: insertedItems },
      ipAddress: actor.ipAddress,
    }, tx)

    return sale!.id
  })

  return { saleId }
}

/**
 * Full cancellation: only for paid sales created today (Jakarta date), restoring
 * tracked stock. Returns the updated sale id; the route re-reads the details.
 */
export async function voidSale(db: Db, actor: SaleActor, saleId: string, input?: VoidInput): Promise<{ saleId: string }> {
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1)
  if (!sale) throw new NotFound('Transaksi tidak ditemukan')
  if (sale.status !== 'paid') throw new BadRequest('Hanya transaksi berstatus lunas yang dapat dibatalkan')

  const now = input?.now ?? new Date()
  const saleDate = businessDate(sale.createdAt)
  const today = businessDate(now)
  if (saleDate !== today) {
    throw new BadRequest('Void hanya untuk transaksi hari ini; gunakan refund')
  }

  await db.transaction(async (tx) => {
    // Re-check under lock so two concurrent voids cannot double-restore stock.
    const [locked] = await tx.select().from(sales).where(eq(sales.id, saleId)).for('update').limit(1)
    if (!locked) throw new NotFound('Transaksi tidak ditemukan')
    if (locked.status !== 'paid') throw new BadRequest('Hanya transaksi berstatus lunas yang dapat dibatalkan')

    await tx.update(sales).set({ status: 'void', updatedAt: new Date() }).where(eq(sales.id, saleId))

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId))
    for (const item of items) {
      const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).for('update')
      if (product && product.trackStock) {
        const newStock = product.stock + item.qty
        await tx.update(products).set({ stock: newStock, updatedAt: new Date() }).where(eq(products.id, item.productId))
        await tx.insert(stockMovements).values({
          productId: item.productId,
          type: 'return',
          qtyChange: item.qty,
          stockBefore: product.stock,
          stockAfter: newStock,
          referenceType: 'sale_void',
          referenceId: saleId,
          createdBy: actor.id,
        })
      }
    }

    await logAudit({
      actorUserId: actor.id,
      action: 'void_sale',
      entityType: 'sale',
      entityId: saleId,
      before: sale,
      after: { ...sale, status: 'void' },
      ipAddress: actor.ipAddress,
    }, tx)
  })

  return { saleId }
}

/** Partial/full refund: validates quantities, restores stock and updates status. */
export async function refundSale(db: Db, actor: SaleActor, saleId: string, input: RefundInput): Promise<{ refundId: string; status: 'refunded' | 'partial_refunded' }> {
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1)
  if (!sale) throw new NotFound('Transaksi tidak ditemukan')
  if (sale.status !== 'paid' && sale.status !== 'partial_refunded') {
    throw new BadRequest('Hanya transaksi lunas atau sebagian yang dapat dikembalikan')
  }

  return db.transaction(async (tx) => {
    const saleItemRows = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId))
    const saleItemMap = new Map(saleItemRows.map((si) => [si.id, si]))

    const existingRefunds = await tx.select().from(refunds).where(eq(refunds.saleId, saleId))
    const totalRefundedQty = new Map<string, number>()
    for (const er of existingRefunds) {
      const items = await tx.select().from(refundItems).where(eq(refundItems.refundId, er.id))
      for (const item of items) {
        totalRefundedQty.set(item.saleItemId, (totalRefundedQty.get(item.saleItemId) ?? 0) + item.qty)
      }
    }

    // Validate refund items
    const refundItemValues = input.items.map((ri) => {
      const saleItem = saleItemMap.get(ri.saleItemId)
      if (!saleItem) throw new NotFound(`Item transaksi ${ri.saleItemId} tidak ditemukan`)
      const refundError = getRefundQuantityError(saleItem.qty, totalRefundedQty.get(saleItem.id) ?? 0, ri.qty)
      if (refundError) throw new BadRequest(refundError)
      totalRefundedQty.set(saleItem.id, (totalRefundedQty.get(saleItem.id) ?? 0) + ri.qty)
      const amount = refundLineAmount(saleItem.price, ri.qty, saleItem.discount)
      return {
        saleItemId: ri.saleItemId,
        productId: saleItem.productId,
        qty: ri.qty,
        amount,
      }
    })

    // Create refund
    const [refund] = await tx.insert(refunds).values({
      saleId,
      reason: input.reason,
      refundedBy: actor.id,
    }).returning()

    // Create refund items
    await tx.insert(refundItems).values(
      refundItemValues.map((v) => ({ ...v, refundId: refund!.id })),
    )

    // Restore stock
    for (const ri of refundItemValues) {
      const [product] = await tx.select().from(products).where(eq(products.id, ri.productId)).for('update')
      if (product && product.trackStock) {
        const newStock = product.stock + ri.qty
        await tx.update(products).set({ stock: newStock, updatedAt: new Date() }).where(eq(products.id, ri.productId))
        await tx.insert(stockMovements).values({
          productId: ri.productId,
          type: 'refund',
          qtyChange: ri.qty,
          stockBefore: product.stock,
          stockAfter: newStock,
          referenceType: 'refund',
          referenceId: refund!.id,
          createdBy: actor.id,
        })
      }
    }

    // Check if full or partial refund
    const isFullRefund = saleItemRows.every(
      (si) => (totalRefundedQty.get(si.id) ?? 0) >= si.qty,
    )

    const newStatus = isFullRefund ? 'refunded' : 'partial_refunded'
    await tx.update(sales).set({ status: newStatus, updatedAt: new Date() }).where(eq(sales.id, saleId))

    await logAudit({
      actorUserId: actor.id,
      action: 'refund_sale',
      entityType: 'sale',
      entityId: saleId,
      after: { refundId: refund!.id, items: refundItemValues, newStatus },
      ipAddress: actor.ipAddress,
    }, tx)

    return { refundId: refund!.id, status: newStatus }
  })
}
