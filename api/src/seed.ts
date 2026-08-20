import bcrypt from 'bcrypt'
import { eq, like } from 'drizzle-orm'
import { db } from './db/client.js'
import {
  auditLogs, categories, payments, products, promos, purchaseItems, purchases,
  refundItems, refunds, saleItems, sales, settings, shifts, stockMovements,
  suppliers, users,
} from './db/schema.js'

const SALT_ROUNDS = 10
const DEMO_PASSWORD = 'demo12345'
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000
type UUID = `${string}-${string}-${string}-${string}-${string}`

function newId() {
  return crypto.randomUUID() as UUID
}

async function ensureUser(opts: {
  email: string
  password: string
  name: string
  role: 'owner' | 'admin' | 'cashier'
  label: string
}) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, opts.email)).limit(1)
  if (existing) {
    console.log(`${opts.label} "${opts.email}" already exists, skipping.`)
    return existing.id
  }

  const [created] = await db.insert(users).values({
    name: opts.name,
    email: opts.email,
    passwordHash: await bcrypt.hash(opts.password, SALT_ROUNDS),
    role: opts.role,
  }).returning({ id: users.id })
  console.log(`${opts.label} "${opts.email}" created.`)
  return created!.id
}

function jakartaDate(day: Date, hour: number, minute = 0) {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute) - JAKARTA_OFFSET_MS)
}

function businessDays(count: number) {
  const now = new Date(Date.now() + JAKARTA_OFFSET_MS)
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const days: Date[] = []
  while (days.length < count) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) days.push(new Date(cursor))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return days
}

const categoryNames = [
  'Sembako', 'Minuman', 'Makanan Ringan', 'Perawatan Diri',
  'Kebutuhan Rumah', 'Bayi & Anak', 'Elektronik', 'Alat Tulis',
]

const productNames = [
  ['Beras Premium 5kg', 'Beras Pulen 5kg', 'Gula Pasir 1kg', 'Minyak Goreng 1L', 'Tepung Terigu 1kg', 'Garam Halus 500g', 'Kecap Manis 600ml', 'Saus Sambal 340ml', 'Telur Ayam 10pcs'],
  ['Air Mineral 600ml', 'Air Mineral 1.5L', 'Teh Botol 450ml', 'Kopi Susu 250ml', 'Susu UHT 1L', 'Jus Jeruk 300ml', 'Minuman Isotonik', 'Soda Lemon 390ml', 'Teh Celup 25s'],
  ['Keripik Kentang', 'Kerupuk Udang', 'Biskuit Cokelat', 'Wafer Keju', 'Kacang Panggang', 'Permen Mint', 'Cokelat Batang', 'Mie Instan Goreng', 'Popcorn Caramel'],
  ['Sabun Mandi Dove', 'Sampo Anti Ketombe', 'Pasta Gigi 120g', 'Sikat Gigi Medium', 'Deodoran Roll On', 'Tisu Wajah 200s', 'Pembersih Wajah', 'Kapas Kecantikan', 'Hand Sanitizer'],
  ['Deterjen Bubuk 800g', 'Pewangi Pakaian 900ml', 'Sabun Cuci Piring', 'Pembersih Lantai', 'Spons Cuci Piring', 'Kantong Sampah 60L', 'Korek Api Gas', 'Baterai AA 2pcs', 'Lampu LED 9W'],
  ['Popok Bayi M 20s', 'Popok Bayi L 18s', 'Tisu Basah 50s', 'Susu Formula 400g', 'Bubur Bayi 120g', 'Botol Susu 240ml', 'Minyak Telon 60ml', 'Sabun Bayi 100g', 'Biskuit Bayi 120g'],
  ['Kabel USB-C 1m', 'Charger USB 20W', 'Headset Kabel', 'Mouse Wireless', 'Flashdisk 32GB', 'Adaptor Universal', 'Power Bank 10000mAh', 'Lampu USB Mini', 'Stop Kontak 3 Lubang'],
  ['Buku Tulis 58 Lembar', 'Pulpen Gel Hitam', 'Pensil 2B 12pcs', 'Penghapus Putih', 'Spidol Board 3pcs', 'Map Plastik', 'Kertas A4 80gsm', 'Stabilo 4 Warna', 'Lakban Bening'],
]

const supplierNames = [
  'PT Sumber Pangan Nusantara', 'CV Segar Makmur', 'PT Minuman Prima', 'CV Rumah Bersih',
  'PT Ibu Sejahtera', 'CV Digital Jaya', 'PT Karya Tulis', 'UD Mitra Grosir',
]

const promoDefinitions = [
  { code: 'DEMO-HEMAT10', name: 'Demo Hemat 10%', type: 'percent' as const, value: 10, maxDiscount: 25000 },
  { code: 'DEMO-POTONG5', name: 'Demo Potongan 5K', type: 'amount' as const, value: 5000, maxDiscount: null },
  { code: 'DEMO-HEMAT15', name: 'Demo Hemat 15%', type: 'percent' as const, value: 15, maxDiscount: 30000 },
  { code: 'DEMO-POTONG10', name: 'Demo Potongan 10K', type: 'amount' as const, value: 10000, maxDiscount: null },
]

async function seedDemoData(adminId: string, cashierIds: string[]) {
  const days = businessDays(45)

  await db.transaction(async (tx) => {
    const [marker] = await tx.select({ id: products.id }).from(products).where(like(products.sku, 'DEMO-%')).limit(1)
    if (marker) {
      console.log('DEMO- products already exist, skipping dummy dataset.')
      return false
    }

    const categoryRows = categoryNames.map((name) => ({ id: newId(), name }))
    await tx.insert(categories).values(categoryRows)

    const productRows = productNames.flatMap((names, categoryIndex) => names.map((name, variant) => {
      const costPrice = 5000 + categoryIndex * 3500 + variant * 750
      const number = categoryIndex * 9 + variant + 1
      return {
        id: newId(), name, sku: `DEMO-${String(number).padStart(3, '0')}`,
        barcode: `DEMO-${String(number).padStart(10, '0')}`,
        categoryId: categoryRows[categoryIndex]!.id, price: costPrice * 2 + 2500,
        costPrice, stock: 0, minStock: 5, trackStock: true,
        allowNegativeStock: false,
      }
    }))
    await tx.insert(products).values(productRows)

    const supplierRows = supplierNames.map((name, index) => ({
      id: newId(), name, phone: `0812-9000-${String(index + 1).padStart(4, '0')}`,
      address: `Jl. Demo Niaga No. ${index + 1}, Jakarta`,
    }))
    await tx.insert(suppliers).values(supplierRows)

    const promoRows = promoDefinitions.map((promo) => ({
      id: newId(), code: promo.code, name: promo.name, type: promo.type,
      value: promo.value, minPurchase: 0,
      maxDiscount: promo.maxDiscount, startsAt: jakartaDate(days[44]!, 0),
      endsAt: null, usageLimit: null, usageCount: 0,
    }))
    await tx.insert(promos).values(promoRows)

    const stock = new Map(productRows.map((product) => [product.id, 0]))
    const purchaseRows: Array<typeof purchases.$inferInsert> = []
    const purchaseItemRows: Array<typeof purchaseItems.$inferInsert> = []
    const purchaseMovementRows: Array<typeof stockMovements.$inferInsert> = []

    for (let purchaseIndex = 0; purchaseIndex < 20; purchaseIndex += 1) {
      const purchaseId = newId()
      const createdAt = jakartaDate(days[(purchaseIndex * 2) % days.length]!, 7, 30)
      const selected = Array.from({ length: 6 }, (_, line) => productRows[(purchaseIndex * 6 + line) % productRows.length]!)
      let totalCost = 0
      for (let line = 0; line < selected.length; line += 1) {
        const product = selected[line]!
        const qty = 40 + ((purchaseIndex + line) % 9)
        const subtotal = qty * product.costPrice
        const before = stock.get(product.id)!
        stock.set(product.id, before + qty)
        totalCost += subtotal
        purchaseItemRows.push({ id: newId(), purchaseId, productId: product.id, productNameSnapshot: product.name, qty, costPrice: product.costPrice, subtotal })
        purchaseMovementRows.push({ productId: product.id, type: 'restock', qtyChange: qty, stockBefore: before, stockAfter: before + qty, referenceType: 'purchase', referenceId: purchaseId, notes: `Demo purchase ${purchaseIndex + 1}`, createdBy: adminId, createdAt })
      }
      purchaseRows.push({ id: purchaseId, invoiceNo: `DEMO-PO-${String(purchaseIndex + 1).padStart(3, '0')}`, supplierId: supplierRows[purchaseIndex % supplierRows.length]!.id, totalCost, notes: 'Demo stock replenishment', createdBy: adminId, createdAt, updatedAt: createdAt })
    }
    await tx.insert(purchases).values(purchaseRows)
    await tx.insert(purchaseItems).values(purchaseItemRows)
    await tx.insert(stockMovements).values(purchaseMovementRows)

    const shiftRows = days.map((day, index) => ({
      id: newId(), cashierId: cashierIds[index % cashierIds.length]!, openedAt: jakartaDate(day, 8),
      closedAt: jakartaDate(day, 17), openingCash: 500000 + (index % 4) * 100000,
      closingCash: 1800000 + (index % 7) * 125000, expectedCash: 1800000 + (index % 7) * 125000,
      difference: index % 6 === 0 ? -5000 : 0, status: 'closed' as const,
    }))
    await tx.insert(shifts).values(shiftRows)

    const demoSales: Array<{ saleId: string; itemIds: string[]; createdAt: Date }> = []
    const saleRows: Array<typeof sales.$inferInsert> = []
    const saleItemRows: Array<typeof saleItems.$inferInsert> = []
    const paymentRows: Array<typeof payments.$inferInsert> = []
    const saleMovementRows: Array<typeof stockMovements.$inferInsert> = []
    const promoUsage = [0, 0, 0, 0]

    for (let saleIndex = 0; saleIndex < 120; saleIndex += 1) {
      const saleId = newId()
      const day = days[saleIndex % days.length]!
      const createdAt = jakartaDate(day, 9 + (saleIndex % 8), (saleIndex * 7) % 60)
      const promoIndex = saleIndex % 4
      const promo = promoRows[promoIndex]!
      const itemCount = 1 + (saleIndex % 3)
      let subtotal = 0
      let lineDiscountTotal = 0
      const itemIds: string[] = []
      for (let line = 0; line < itemCount; line += 1) {
        const product = productRows[(saleIndex * 7 + line * 13) % productRows.length]!
        const qty = 1 + ((saleIndex + line) % 3)
        const discount = saleIndex % 11 === 0 ? 500 : 0
        const itemSubtotal = (product.price - discount) * qty
        const before = stock.get(product.id)!
        stock.set(product.id, before - qty)
        subtotal += itemSubtotal
        lineDiscountTotal += discount * qty
        const itemId = newId()
        itemIds.push(itemId)
        saleItemRows.push({ id: itemId, saleId, productId: product.id, productNameSnapshot: product.name, qty, price: product.price, discount, subtotal: itemSubtotal })
        saleMovementRows.push({ productId: product.id, type: 'sale', qtyChange: -qty, stockBefore: before, stockAfter: before - qty, referenceType: 'sale', referenceId: saleId, notes: `Demo sale ${saleIndex + 1}`, createdBy: cashierIds[saleIndex % cashierIds.length]!, createdAt })
      }
      const promoDiscount = promo.type === 'percent' ? Math.min(Math.round(subtotal * promo.value / 100), promo.maxDiscount ?? subtotal) : Math.min(promo.value, subtotal)
      const grandTotal = subtotal - promoDiscount
      const method = saleIndex % 3 === 0 ? 'cash' as const : saleIndex % 3 === 1 ? 'qris' as const : 'transfer' as const
      const changeTotal = method === 'cash' ? 5000 : 0
      const paidTotal = grandTotal + changeTotal
      const cashierId = cashierIds[saleIndex % cashierIds.length]!
      saleRows.push({ id: saleId, invoiceNo: `DEMO-INV-${String(saleIndex + 1).padStart(4, '0')}`, cashierId, shiftId: shiftRows[saleIndex % shiftRows.length]!.id, subtotal, discountTotal: lineDiscountTotal + promoDiscount, taxTotal: 0, grandTotal, paidTotal, changeTotal, status: 'paid', discount: 0, promoId: promo.id, promoCode: promo.code, promoDiscount, createdAt, updatedAt: createdAt })
      paymentRows.push({ saleId, method, amount: paidTotal, referenceNo: method === 'cash' ? null : `DEMO-PAY-${String(saleIndex + 1).padStart(4, '0')}`, createdAt })
      promoUsage[promoIndex] = (promoUsage[promoIndex] ?? 0) + 1
      demoSales.push({ saleId, itemIds, createdAt })
    }
    await tx.insert(sales).values(saleRows)
    await tx.insert(saleItems).values(saleItemRows)
    await tx.insert(payments).values(paymentRows)
    await tx.insert(stockMovements).values(saleMovementRows)
    for (let index = 0; index < promoRows.length; index += 1) {
      await tx.update(promos).set({ usageCount: promoUsage[index]!, updatedAt: new Date() }).where(eq(promos.id, promoRows[index]!.id))
    }

    const refundRows: Array<typeof refunds.$inferInsert> = []
    const refundItemRows: Array<typeof refundItems.$inferInsert> = []
    const refundMovementRows: Array<typeof stockMovements.$inferInsert> = []
    for (const saleIndex of [7, 31, 64, 95]) {
      const demoSale = demoSales[saleIndex]!
      const item = saleItemRows.find((row) => row.id === demoSale.itemIds[0])!
      const refundId = newId()
      const createdAt = new Date(demoSale.createdAt.getTime() + 60 * 60 * 1000)
      const productId = item.productId! as UUID
      const saleItemId = item.id!
      const before = stock.get(productId)!
      stock.set(productId, before + 1)
      const saleItemsForSale = saleItemRows.filter((row) => row.saleId === demoSale.saleId)
      const fullRefund = saleItemsForSale.length === 1 && saleItemsForSale[0]!.qty === 1
      refundRows.push({ id: refundId, saleId: demoSale.saleId, reason: 'Demo customer return', refundedBy: adminId, createdAt })
      refundItemRows.push({ id: newId(), refundId, saleItemId, productId, qty: 1, amount: item.price - (item.discount ?? 0) })
      refundMovementRows.push({ productId, type: 'refund', qtyChange: 1, stockBefore: before, stockAfter: before + 1, referenceType: 'refund', referenceId: refundId, notes: 'Demo refund', createdBy: adminId, createdAt })
      await tx.update(sales).set({ status: fullRefund ? 'refunded' : 'partial_refunded', updatedAt: createdAt }).where(eq(sales.id, demoSale.saleId))
    }
    await tx.insert(refunds).values(refundRows)
    await tx.insert(refundItems).values(refundItemRows)
    await tx.insert(stockMovements).values(refundMovementRows)

    for (const product of productRows) {
      await tx.update(products).set({ stock: stock.get(product.id)!, updatedAt: new Date() }).where(eq(products.id, product.id))
    }

    const demoAuditRows: Array<typeof auditLogs.$inferInsert> = [
      { actorUserId: adminId, action: 'seed', entityType: 'dataset', entityId: 'DEMO-DATASET', afterJson: { categories: 8, products: 72, sales: 120 } },
      ...productRows.slice(0, 12).map((product) => ({ actorUserId: adminId, action: 'create', entityType: 'product', entityId: product.id, afterJson: { sku: product.sku, name: product.name } })),
      ...purchaseRows.slice(0, 8).map((purchase) => ({ actorUserId: adminId, action: 'purchase', entityType: 'purchase', entityId: purchase.id!, afterJson: { invoiceNo: purchase.invoiceNo, totalCost: purchase.totalCost! } })),
    ]
    await tx.insert(auditLogs).values(demoAuditRows)
  })

  console.log('Demo dataset created: 8 categories, 72 products, 8 suppliers, 4 promos, 20 purchases, 120 sales, 45 shifts, 4 refunds.')
  return true
}

async function seed() {
  await ensureUser({ email: process.env.OWNER_EMAIL || 'owner@pos.local', password: process.env.OWNER_PASSWORD || 'change-me', name: process.env.OWNER_NAME || 'Owner', role: 'owner', label: 'Owner' })

  const cashierEmail = process.env.CASHIER_EMAIL
  const cashierPassword = process.env.CASHIER_PASSWORD
  if (cashierEmail && cashierPassword) {
    await ensureUser({ email: cashierEmail, password: cashierPassword, name: process.env.CASHIER_NAME || 'Cashier', role: 'cashier', label: 'Cashier' })
  } else {
    console.log('CASHIER_EMAIL/CASHIER_PASSWORD not set, skipping cashier seed.')
  }

  const [existingSettings] = await db.select({ id: settings.id }).from(settings).limit(1)
  if (!existingSettings) {
    await db.insert(settings).values({})
    console.log('Default settings created.')
  } else {
    console.log('Settings already exist, skipping.')
  }

  if (process.env.SEED_DEMO === 'true') {
    const adminId = await ensureUser({ email: 'demo.admin@pos.local', password: DEMO_PASSWORD, name: 'Demo Admin', role: 'admin', label: 'Demo admin' })
    const cashierIds = []
    for (let index = 1; index <= 4; index += 1) {
      cashierIds.push(await ensureUser({ email: `demo.cashier${index}@pos.local`, password: DEMO_PASSWORD, name: `Demo Cashier ${index}`, role: 'cashier', label: `Demo cashier ${index}` }))
    }

    const demoCreated = await seedDemoData(adminId, cashierIds)
    if (demoCreated) console.log('Demo accounts: demo.admin@pos.local / demo12345; demo.cashier1@pos.local .. demo.cashier4@pos.local / demo12345')
  } else {
    console.log('SEED_DEMO not enabled, skipping demo dataset (set SEED_DEMO=true to include).')
  }
  console.log('Seed complete.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
