import { eq, and, or, lte, gte, isNull } from 'drizzle-orm'
import type { Db } from '../db/types.js'
import { promos } from '../db/schema.js'
import { AppError, NotFound } from '../lib/errors.js'
import { computePromoDiscount } from '../lib/sale-pricing.js'

export type PromoRow = typeof promos.$inferSelect

/** Error class a caller wants for an unusable code (checkout uses BadRequest). */
export type PromoEligibilityError = new (message: string) => AppError

export interface FindEligiblePromoOptions {
  /** Clock override for the date-window check (tests). */
  now?: Date
  /** Lock the row: checkout must, so a concurrent checkout cannot over-use it. */
  lock?: boolean
  /** Error subclass thrown for unusable codes. Defaults to NotFound. */
  onError?: PromoEligibilityError
}

/**
 * The single source of truth for promo-code usability: normalises the code to
 * its stored form (trim + uppercase), then requires the promo to be active,
 * inside its date window and under its usage limit; returns the row (callers
 * read `minPurchase`, `maxDiscount`, etc.). minPurchase is NOT checked here:
 * checkout reports it through priceSale, while the validate endpoint throws
 * NotFound — each endpoint maps only the errors it owns.
 */
export async function findEligiblePromo(
  dbOrTx: Db,
  code: string,
  opts: FindEligiblePromoOptions = {},
): Promise<PromoRow> {
  const { now = new Date(), lock = false, onError = NotFound } = opts

  const query = dbOrTx
    .select()
    .from(promos)
    .where(
      and(
        eq(promos.code, code.trim().toUpperCase()),
        eq(promos.isActive, true),
        lte(promos.startsAt, now),
        or(isNull(promos.endsAt), gte(promos.endsAt, now)),
      ),
    )
    .limit(1)

  const [promo] = lock ? await query.for('update') : await query
  if (!promo) throw new onError('Promo tidak ditemukan atau sudah tidak berlaku')
  if (promo.usageLimit != null && promo.usageCount >= promo.usageLimit) {
    throw new onError('Promo sudah mencapai batas pemakaian')
  }
  return promo
}

/** Promo as the cashier UI sees it after validation. */
export interface ValidatedPromo {
  id: string
  code: string
  name: string
  type: 'percent' | 'amount'
  value: number
  /** Minimum pre-discount subtotal required for the promo to apply. */
  minPurchase: number
  /** Cap for percent promos. */
  maxDiscount: number | null
  /** Discount this promo grants on the given subtotal. */
  discount: number
}

/**
 * Cashier-facing validation: the usable promo plus its minPurchase gate and the
 * discount it grants on `subtotal`. Errors are NotFound (the endpoint contract).
 */
export async function validatePromo(db: Db, code: string, subtotal: number, now?: Date): Promise<ValidatedPromo> {
  const promo = await findEligiblePromo(db, code, { now })

  if (subtotal < promo.minPurchase) {
    throw new NotFound(`Minimal belanja untuk promo ini ${promo.minPurchase}`)
  }

  return {
    id: promo.id,
    code: promo.code,
    name: promo.name,
    type: promo.type,
    value: promo.value,
    minPurchase: promo.minPurchase,
    maxDiscount: promo.maxDiscount,
    discount: computePromoDiscount(promo.type, promo.value, subtotal, promo.maxDiscount),
  }
}
