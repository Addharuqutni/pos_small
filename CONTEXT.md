# CONTEXT — Domain glossary

Shared vocabulary for the POS domain. Each term lists the module that owns it.
Keep this file short; when behaviour changes, update the owning module's doc
comment first, then this glossary.

## Sale

A completed (or voided/refunded) transaction header: invoice number, cashier,
shift, totals, payments, status (`paid | void | refunded | partial_refunded`).
Owned by `api/src/domain/sale-ledger.ts`; listed/read via
`api/src/domain/sale-query.ts`; API shapes consumed by `src/queries/sales.ts`.

## Checkout

Atomic creation of a Sale: locks the cashier's open shift and product rows,
validates stock and promo eligibility, prices the cart, then writes sale, items,
payments, promo usage, stock movements and audit in one transaction.
`checkoutSale()` in `api/src/domain/sale-ledger.ts`.

## Sale pricing

The pure, dependency-free total engine: takes the whole cart plus a promo rule
and returns `subtotal`, `lineDiscountTotal`, `promoDiscount`, `saleDiscount`,
`taxable`, `taxTotal`, `grandTotal`, `discountTotal`, `paidTotal`, `changeTotal`
and soft errors (never throws). Owned by `api/src/lib/sale-pricing.ts`, imported
verbatim by the cashier UI (`src/pages/cashier/use-checkout-pricing.ts`).

## Sale ledger

The write side of Sales and Shifts: `checkoutSale`, `voidSale`, `refundSale`,
each a single `db.transaction` including its audit row, throwing `AppError`
subclasses. Owned by `api/src/domain/sale-ledger.ts`.

## Void (same-day, Jakarta business date)

Full cancellation of a paid sale, allowed only while the sale's business date
(Asia/Jakarta) equals today's; older sales must be refunded instead. Restores
tracked stock and records a `void_sale` audit row. `voidSale()` in
`api/src/domain/sale-ledger.ts` — the `now` clock is injectable for tests.

## Refund (partial/full, qty cap across refunds)

Returns money for specific sale items. Requested qty is capped at sold qty
minus everything already refunded across previous refunds; restoring tracked
stock, and marking the sale `partial_refunded` or `refunded` once every line is
fully returned. `refundSale()` in `api/src/domain/sale-ledger.ts`, with
per-unit math in `api/src/lib/sale-pricing.ts` (`refundLineAmount`).

## Promo (min purchase, cap, usage limit)

A discount rule: `percent` (optionally capped by `maxDiscount`) or flat
`amount`, gated by `minPurchase`; discount math lives in `priceSale`. Code
usability (normalisation, active, date window, usage limit) is centralised in
`findEligiblePromo()` in `api/src/domain/promo.ts` — checkout calls it with
`lock: true`, the cashier validate endpoint via `validatePromo()` (which also
enforces `minPurchase` and returns it to the UI). Management routes are
`api/src/modules/promos.ts`.

## Shift (one open per cashier, expected cash)

A cashier's cash session. At most one open shift per cashier (partial unique
index, enforced under `FOR UPDATE`). Expected cash at close = opening cash +
cash sales (non-void) − cash refunds. Owned by `api/src/domain/shift.ts`;
cashier screens via `src/queries/shifts.ts`.

## Stock movement

An append-only audit trail row for every stock change: `sale`, `refund`
(restock on return), `return` (void), `adjustment`, `restock`, each storing
`stockBefore`/`stockAfter`. Written by the domain modules above; exposed by
`api/src/modules/stock.ts`.

## Business date

The store's calendar day: **Asia/Jakarta** (UTC+7, no DST), computed with
`Intl.DateTimeFormat` in `api/src/domain/sale-ledger.ts` so it works on any
Postgres driver. Used to enforce the void same-day rule.
