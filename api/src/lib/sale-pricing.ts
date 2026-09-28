/**
 * Pure sale-pricing engine shared by the API (`api/src/modules/sales.ts`) and the
 * cashier UI: zero imports and no Node APIs, so the frontend imports this exact
 * file (compiles under NodeNext and Vite).
 *
 * `priceSale({ lines, promo, saleDiscount, taxRate, payments })` prices the whole
 * cart (per-unit line discounts) and returns `subtotal`, `lineDiscountTotal`,
 * `promoDiscount`, `saleDiscount`, `taxable`, `taxTotal`, `grandTotal`,
 * `discountTotal`, `paidTotal`, `changeTotal`, `lines` and soft `errors` (`ok`
 * false when non-empty). Never throws, so incomplete/unpaid carts can be priced;
 * omitting `payments` skips the payment checks. Rounding, clamping and Indonesian
 * messages mirror the server; promo DB eligibility stays in sales.ts.
 */

export type PromoRule = {
  type: 'percent' | 'amount'
  value: number
  /** Cap for `percent` promos (ignored for `amount`). */
  maxDiscount?: number | null
  /** Pre-discount subtotal required for the promo to apply (defaults to 0). */
  minPurchase?: number | null
}

export type PricingLine = {
  price: number
  qty: number
  /** Discount per unit. */
  discount: number
  /** Optional product name, used in error messages. */
  name?: string
}

/** One tender line handed to `priceSale`; amounts are integer rupiah. */
export type PricingPayment = {
  method: 'cash' | 'qris' | 'transfer'
  amount: number
}

export type PriceSaleInput = {
  lines: PricingLine[]
  promo?: PromoRule | null
  saleDiscount?: number
  /** Tax percentage, e.g. 11 for 11%. Pass 0 when tax is disabled. */
  taxRate?: number
  /** Amounts tendered. Omit/null while the tender is unknown to skip payment checks. */
  payments?: PricingPayment[] | null
}

export type SalePricingErrorCode =
  | 'line_discount_exceeds_price'
  | 'sale_discount_exceeds_total'
  | 'promo_min_purchase'
  | 'duplicate_payment_method'
  | 'non_cash_exceeds_total'
  | 'underpaid'

export type SalePricingError = {
  code: SalePricingErrorCode
  lineIndex?: number
  message: string
}

export type SalePricingLine = {
  price: number
  qty: number
  discount: number
  gross: number
  discountTotal: number
  net: number
}

export type SalePricing = {
  lines: SalePricingLine[]
  subtotal: number
  lineDiscountTotal: number
  promoDiscount: number
  saleDiscount: number
  taxable: number
  taxTotal: number
  grandTotal: number
  discountTotal: number
  paidTotal: number
  changeTotal: number
  errors: SalePricingError[]
  ok: boolean
}

function lineDiscountError(price: number, discount: number, productName?: string): SalePricingError | null {
  if (discount <= price) return null
  return {
    code: 'line_discount_exceeds_price',
    message: productName
      ? `Diskon melebihi harga item untuk "${productName}"`
      : 'Diskon melebihi harga item',
  }
}

/** Net amount of one line: per-unit discount applied first, then quantity. */
export function lineSubtotal(price: number, qty: number, discount: number): number {
  return (price - discount) * qty
}

/** Cash returned for a (partial) refund of one sale item line. */
export function refundLineAmount(price: number, qty: number, discount: number): number {
  return Math.round(lineSubtotal(price, qty, discount))
}

export function getRefundQuantityError(soldQty: number, alreadyRefundedQty: number, requestedQty: number): string | null {
  return alreadyRefundedQty + requestedQty > soldQty ? 'Jumlah refund melebihi sisa qty penjualan' : null
}

/**
 * Compute the discount a promo grants against a pre-discount subtotal.
 * `value` is a percentage (0-100) for 'percent' promos or a flat minor-unit
 * amount for 'amount' promos. Never returns more than the subtotal.
 */
export function computePromoDiscount(
  type: 'percent' | 'amount',
  value: number,
  subtotal: number,
  maxDiscount: number | null,
): number {
  if (type === 'percent') {
    let amount = Math.round((subtotal * value) / 100)
    if (maxDiscount != null) amount = Math.min(amount, maxDiscount)
    return Math.max(0, Math.min(amount, subtotal))
  }
  return Math.max(0, Math.min(value, subtotal))
}

export function priceSale(input: PriceSaleInput): SalePricing {
  const errors: SalePricingError[] = []
  const lines: SalePricingLine[] = []
  let subtotal = 0
  let lineDiscountTotal = 0

  for (const [index, line] of input.lines.entries()) {
    const gross = line.price * line.qty
    const lineDiscount = line.discount * line.qty
    const net = lineSubtotal(line.price, line.qty, line.discount)
    subtotal += net
    lineDiscountTotal += lineDiscount
    lines.push({
      price: line.price,
      qty: line.qty,
      discount: line.discount,
      gross,
      discountTotal: lineDiscount,
      net,
    })
    const lineError = lineDiscountError(line.price, line.discount, line.name)
    if (lineError) errors.push({ ...lineError, lineIndex: index })
  }

  const promo = input.promo ?? null
  let promoDiscount = 0
  if (promo) {
    const minPurchase = promo.minPurchase ?? 0
    if (subtotal < minPurchase) {
      errors.push({ code: 'promo_min_purchase', message: `Minimal belanja untuk promo ini ${minPurchase}` })
    } else {
      promoDiscount = computePromoDiscount(promo.type, promo.value, subtotal, promo.maxDiscount ?? null)
    }
  }

  const saleDiscount = input.saleDiscount ?? 0
  if (saleDiscount > subtotal - promoDiscount) {
    errors.push({ code: 'sale_discount_exceeds_total', message: 'Diskon penjualan melebihi subtotal' })
  }

  const taxable = subtotal - promoDiscount - saleDiscount
  const taxTotal = Math.round((taxable * (input.taxRate ?? 0)) / 100)
  const grandTotal = taxable + taxTotal
  const discountTotal = lineDiscountTotal + promoDiscount + saleDiscount

  const tender = input.payments ?? null
  const paidTotal = tender?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0
  if (tender) {
    const methods = new Set<string>()
    let hasDuplicateMethod = false
    for (const payment of tender) {
      if (methods.has(payment.method)) hasDuplicateMethod = true
      methods.add(payment.method)
    }
    if (hasDuplicateMethod) {
      errors.push({ code: 'duplicate_payment_method', message: 'Setiap metode pembayaran hanya boleh sekali' })
    }

    const nonCashTotal = tender.reduce(
      (sum, payment) => (payment.method === 'cash' ? sum : sum + payment.amount),
      0,
    )
    if (nonCashTotal > grandTotal) {
      errors.push({ code: 'non_cash_exceeds_total', message: 'Pembayaran non-tunai melebihi total tagihan' })
    }

    if (paidTotal < grandTotal) {
      errors.push({ code: 'underpaid', message: `Pembayaran kurang: butuh ${grandTotal}, diterima ${paidTotal}` })
    }
  }

  // Change can only come from cash, since non-cash may not exceed the total.
  const changeTotal = Math.max(0, paidTotal - grandTotal)

  return {
    lines,
    subtotal,
    lineDiscountTotal,
    promoDiscount,
    saleDiscount,
    taxable,
    taxTotal,
    grandTotal,
    discountTotal,
    paidTotal,
    changeTotal,
    errors,
    ok: errors.length === 0,
  }
}
