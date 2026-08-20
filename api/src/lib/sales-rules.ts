export function getLineDiscountError(price: number, discount: number, productName: string): string | null {
  return discount > price ? `Diskon melebihi harga item untuk "${productName}"` : null
}

export function lineSubtotal(price: number, qty: number, discount: number): number {
  return (price - discount) * qty
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

export function getSaleDiscountError(subtotal: number, saleDiscount: number): string | null {
  return saleDiscount > subtotal ? 'Diskon penjualan melebihi subtotal' : null
}
