export function getLineDiscountError(price: number, discount: number, productName: string): string | null {
  return discount > price ? `Discount exceeds item price for "${productName}"` : null
}

export function lineSubtotal(price: number, qty: number, discount: number): number {
  return (price - discount) * qty
}

export function getRefundQuantityError(soldQty: number, alreadyRefundedQty: number, requestedQty: number): string | null {
  return alreadyRefundedQty + requestedQty > soldQty ? 'Refund qty exceeds remaining sale qty' : null
}
