# TODO

## Report-stack consolidation (from 2026-07-06 simplification grill)

- [ ] **Unify "services processed" definition** — worker-productivity completions
  (`report-range.repository.ts` `fetchCompletions`, `to_status = 'ready_for_pickup'`)
  must match the daily KPI's `ITEM_PROCESSED_STATUSES`
  (`report.repository.ts:30`, includes `quality_check`). Canonical definition now
  in CONTEXT.md ("Services processed"): counts on first reaching `quality_check`.
  Metric renamed from "Item processed" in #95 — Item now means a physical object,
  so the old name counted the wrong noun; `ITEM_PROCESSED_STATUSES` should be
  renamed with it. Small standalone fix; can land before the full consolidation.
- [ ] **Finish the metric rename in the code** — the "Services processed" rename
  in #95 was glossary-only. The daily KPI still ships `items_processed`
  (`report.service.ts:45`) off `countDailyItemsProcessed` /
  `ITEM_PROCESSED_STATUSES` (`report.repository.ts:30`, `:83`), surfaced as the
  "Items processed" tile (`overview-panel.tsx:165`). Worker productivity ships the
  *other* forbidden noun — `items_completed` / `total_items_completed`
  (`report-range.repository.ts:815`, `report-range.service.ts:781`) surfaced in
  `workers-panel.tsx` (tile at :95, CSV header at :71) and `reports.tsx:184`.
  That one counts `ready_for_pickup`, so it is a **different metric**, not the
  same one misnamed — it needs its own name, not a blind rename. Both API fields
  are breaking renames: land them with the consolidation below, not before.
- [ ] **Merge the two report stacks** — `report.repository.ts` (daily/overview)
  and `report-range.repository.ts`/`report-range.service.ts` (7 range panels)
  duplicate paid revenue, refunds sum, category revenue, and orders_out (×4
  implementations), and bucket dates two different ways (hand-rolled
  `to_char AT TIME ZONE` vs `jakartaBucketExpr`). Extract shared query builders
  (paid-window + optional-store filter skeleton is copy-pasted across ~15
  bucketed-series functions); one bucketing util. Existing report tests stay green.
- [x] **Web voucher double-bookkeeping** (done 2026-07-31, PR #64) — the form
  field `appliedVouchers: {code, campaign}[]` is now the single home; the
  Zustand `resolvedVoucherEntries` slice and its mirror effects are deleted.

## Architecture-deepening follow-ups (extracted 2026-06-10, source: docs/architecture-deepening.md)

- [ ] **`push:prod` before next prod deploy** — now also includes the **Repair
  blank-price** schema from ADR-0018: `services.price` DROP NOT NULL + DROP
  DEFAULT (NULL = no list price — Repair's catalog row), `orders_services.price`
  DROP NOT NULL (NULL = not yet determined), and the new
  `order_service_price_logs` table (every price set-or-correct logs the acting
  user). The earlier estimate design's `estimated_price` /
  `estimate_confirmed_at` columns and their CHECKs never reach prod — it was
  reversed before deploying. All widening or additive — existing rows keep
  their prices, no backfill — but the deploy breaks without it: intake inserts
  NULL for a blank Repair line (NOT NULL violation → every Repair checkout
  500s) and the price set/correct endpoint writes `order_service_price_logs`
  (missing table → 500). Applied to dev only so far.
- [ ] **`push:prod` before next prod deploy** — product-refund schema guards
  (`order_refund_items_line_xor_check` CHECK + `order_refund_items_product_uidx`
  partial unique index) exist only in dev. They are the only concurrency guards
  for product refunds. (§8) Now also includes the **product-cancel** columns +
  CHECKs from ADR-0008 (`order_products.cancelled_at`/`cancel_reason`/`cancel_note`
  + `order_products_cancel_refund_xor_check`,
  `order_products_cancel_reason_required_check`,
  `order_products_cancel_other_reason_requires_note_check`).
- [ ] **Integration-test DB strategy** — deferred 3× (§1/§4/§5). Partial as of
  2026-06-15: pure-function unit tests now exist for status machine
  (`order-status-machine.test.ts`), campaign eligibility
  (`campaign-eligibility.test.ts`), middleware (`admin.test.ts`), permissions
  (`permissions.test.ts`). Still **no DB integration coverage** for the
  DB-touching paths: pickup transaction, refund caps.
- [x] **Web cancel-button gate check** (verified 2026-06-15) — UI aligns with
  server; "Cancel order" renders for any staff on unpaid Orders, no role gate on
  either layer:
  - Server `routes/admin/orders.ts:428` → `assertOrderAccess` (store-scope only,
    `utils/authorization.ts:51`), no `assertCanCancel`; payment_status guard in
    service.
  - Web `order-action-gates.ts:49` `canCancelOrder = !isPaid && hasCancellableServices`
    (no role check); rendered at `order-detail-header.tsx:122`.
  - Refund stays admin-only (`canRefundWholeOrder` checks `isAdmin`). Matches
    ADR-0004 amendment (cancel = open capability, no `assertCan`). (§3)
- [x] **Product refund reason/note on order detail** (done 2026-06-15) —
  `order-products-card.tsx` maps `detail.refunds[].items` by `order_product_id`
  and renders the reason + note on each refunded product line via
  `formatRefundReason`. Client-only; no server change. (§8)
- [x] **Products-only unpaid Order can't cancel** (done 2026-06-15) — resolved by
  making cancel the per-line, unpaid twin of refund (services + products), per
  [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md). Products
  gained `cancelled_at`/`cancel_reason`/`cancel_note`; cancelling an unpaid
  product line restores stock; `deriveOrderStatus` rolls up over all lines. (§8)

## AWS / CDN follow-ups

- [x] **Custom domain for CloudFront** (done 2026-06-15) — live on `cdn.fresclean.id`
  (note: `.id`, not the originally-planned `.com`). `CDN_BASE_URL` in
  `packages/server/.env` already set to `https://cdn.fresclean.id`. Confirm the
  prod `.env` carries the same value before next deploy.

- [ ] **Billing budget alert** — protect against surprise charges
  - Console → Billing → Budgets → Create budget
  - Monthly cost budget, $10 USD threshold
  - Email alert at 80% actual + 100% forecasted

- [ ] **Enable MFA on AWS root account** — security baseline
  - IAM → Security credentials → Assign MFA device
  - Use authenticator app (1Password, Authy, etc.)

- [ ] **Prod environment separation** — decide strategy
  - Option A: separate bucket + distribution per env (cleanest)
  - Option B: single bucket with `dev/` / `prod/` key prefixes (cheaper, simpler)
  - Recommendation: Option A for prod isolation
