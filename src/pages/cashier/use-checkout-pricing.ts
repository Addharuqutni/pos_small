import { useMemo } from 'react'
import { priceSale, type PriceSaleInput, type SalePricing, type SalePricingError } from '../../../api/src/lib/sale-pricing.ts'
import type { CartItem, StoreSettings, ValidatedPromo } from '@/types'

export interface CheckoutItems {
  productId: string
  qty: number
  discount: number
}

export interface CheckoutPricing {
  /** The priced cart as the engine sees it — hand the same object to the payment modal. */
  input: PriceSaleInput
  /** Cart priced without a tender (no `payments`), for shelf totals. */
  pricing: SalePricing
  /** POST /sales payload lines. */
  items: CheckoutItems[]
  /** Errors that must block checkout before the tender is known (`underpaid` excluded). */
  blockingErrors: SalePricingError[]
}

/**
 * Cart → shared pricing input. This is the only place that translates cart
 * state into engine input, so the shelf totals and the payment modal can never
 * price the same cart differently.
 */
export function buildPricingInput(
  items: CartItem[],
  appliedPromo: ValidatedPromo | null,
  saleDiscount: number,
  settings: StoreSettings | null | undefined,
): PriceSaleInput {
  return {
    lines: items.map((item) => ({
      price: item.product.price,
      qty: item.qty,
      discount: item.discount,
      name: item.product.name,
    })),
    promo: appliedPromo
      ? {
          type: appliedPromo.type,
          value: appliedPromo.value,
          maxDiscount: appliedPromo.maxDiscount,
          minPurchase: appliedPromo.minPurchase,
        }
      : null,
    saleDiscount,
    taxRate: settings?.taxEnabled ? settings.taxRate : 0,
  }
}

/** Cart → POST /sales payload lines. */
export function buildCheckoutItems(items: CartItem[]): CheckoutItems[] {
  return items.map((item) => ({
    productId: item.product.id,
    qty: item.qty,
    discount: item.discount,
  }))
}

export function useCheckoutPricing(
  items: CartItem[],
  appliedPromo: ValidatedPromo | null,
  saleDiscount: number,
  settings: StoreSettings | null | undefined,
): CheckoutPricing {
  const input = useMemo(
    () => buildPricingInput(items, appliedPromo, saleDiscount, settings),
    [items, appliedPromo, saleDiscount, settings],
  )
  const pricing = useMemo(() => priceSale(input), [input])
  const checkoutItems = useMemo(() => buildCheckoutItems(items), [items])

  return {
    input,
    pricing,
    items: checkoutItems,
    blockingErrors: pricing.errors.filter((error) => error.code !== 'underpaid'),
  }
}
