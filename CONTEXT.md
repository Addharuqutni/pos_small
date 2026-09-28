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

## Mixed payment rules

`priceSale` takes `payments: { method: 'cash' | 'qris' | 'transfer'; amount }[]`
(the exported `PricingPayment` type) — omit/null it while the tender is unknown
and the payment checks are skipped. Rules: every method at most once
(`duplicate_payment_method`), non-cash tendered may never exceed the grand total
(`non_cash_exceeds_total`) because change always comes out of cash, and the sum
must cover the total (`underpaid`). Error order: line/promo/sale-discount errors,
then `duplicate_payment_method`, `non_cash_exceeds_total`, `underpaid`.
`changeTotal = max(0, paidTotal − grandTotal)`.

## Cost snapshot

Each `sale_items` row stores `cost_price` (the product's cost at checkout time,
so profit never moves when a product's cost changes later) and `cost_estimated`
(true only for rows backfilled from the current product cost by migration
`0002_adorable_sugar_man`; checkouts always write false). Purchases update
`products.cost_price` to the received item's `costPrice` in the same transaction
that restocks. Owned by `api/src/domain/sale-ledger.ts` (`checkoutSale`).

## Gross profit

Per sale item of non-void sales: `allocated revenue = item.subtotal ×
(sale.subtotal − promo_discount − discount) / sale.subtotal` (0 when the sale
subtotal is 0) so sale-level discounts spread proportionally and tax is excluded;
refunds subtract the refunded item amounts (revenue) and refunded qty (COGS).
`cogs = cost_price × (qty − refunded qty)`, `grossProfit = revenue − cogs`,
`marginPct = grossProfit / revenue × 100` (null when revenue is 0, 1 decimal).
Owned by `api/src/domain/profit-report.ts` (GET `/api/reports/profit`, owner only).

## Report filters

Optional `cashierId`, `paymentMethod`, `status`, `categoryId`, `productId` query
params shared by `/api/reports/sales|products|categories|cashiers|profit`
(`paymentMethod` = sale has a payment with that method; `categoryId`/`productId`
= sale contains a matching item; absent `status` keeps the historical default of
excluding void sales). Filter→SQL building lives in
`api/src/domain/report-filters.ts`, so json, csv and html output honour the same
rows.

The profit report is the exception on two points: it **always** excludes void
sales (an explicit `status=void` therefore yields no rows), and its
`productId`/`categoryId` select individual **items** rather than whole sales, so
a mixed sale contributes only its matching lines.

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
cash tendered on non-void sales (payments.amount) − change handed back
(sales.change_total) − cash refunds (refunds on sales that had a cash payment).
Change is always paid from the drawer: non-cash tenders may not exceed the total
(see Mixed payment rules). Shifts closed before this fix keep the
`expected_cash`/`difference` values stored at closing time; only new closes use
the new formula. Owned by `api/src/domain/shift.ts`; cashier screens via
`src/queries/shifts.ts`.

## Stock movement

An append-only audit trail row for every stock change: `sale`, `refund`
(restock on return), `return` (void), `adjustment`, `restock`, each storing
`stockBefore`/`stockAfter`. Written by the domain modules above; exposed by
`api/src/modules/stock.ts`.

## Business date

The store's calendar day: **Asia/Jakarta** (UTC+7, no DST), computed with
`Intl.DateTimeFormat` in `api/src/domain/sale-ledger.ts` so it works on any
Postgres driver. Used to enforce the void same-day rule.
