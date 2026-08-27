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

- [ ] **Apply the ADR-0017 Item migration to PROD** —
  `packages/server/migrations/0001-adr-0017-item-groups-order-services.sql`.
  Runbook: `docs/runbooks/2026-08-27-adr-0017-prod.md`.
  Creates `items`, adds `orders_services.item_id`, backfills one Item per
  existing treatment row, then drops `brand`/`color`/`model`/`size`/`item_code`
  and tightens `item_id`/`order_id` to NOT NULL. **Do not run `push:dev` or
  `push:prod` for this one** — either would add the NOT NULL column against
  populated rows and drop the five columns before anything had copied them,
  losing every tag code in the shop, and no generator writes the
  `INSERT..SELECT` that has to run between the two halves. Run the file itself;
  it is one transaction, so a failure leaves the database exactly as it was.
  - **Dev: done 2026-08-27.** 357 treatment rows → 357 Items, 0 unlinked,
    composite FK rejects a cross-Order link. Re-seeded afterwards, so dev now
    has genuinely grouped Items (264 Items over 349 treatments, 72 of them
    multi-treatment) rather than the 1:1 backfill.
  - **Prod: not applied.** The code is merged ahead of the schema, so every
    order read 500s until it runs.
- [ ] **Backfill `orders.status` after the cancelled-sibling fix** — the rollup
  no longer reads a cancelled line as evidence that work started, so orders
  whose live lines are all queued but which carry a cancelled line move
  `processing` → `created`. The fix only corrects rows something later touches,
  so stored rows stay stale until backfilled. Dev: done (1 order). Prod: pending,
  and it must run **after** the ADR-0017 migration, because the finder query
  reads `orders_services`. Query and `recomputeOrderRollup` loop are in the
  runbook.
- [x] **`push:prod` before next prod deploy** (verified applied 2026-08-25) —
  now also includes the **Repair blank-price** schema from ADR-0018: `services.price` DROP NOT NULL + DROP
  DEFAULT (NULL = no list price — Repair's catalog row), `orders_services.price`
  DROP NOT NULL (NULL = not yet determined), and the new
  `order_service_price_logs` table (every price set-or-correct logs the acting
  user). The earlier estimate design's `estimated_price` /
  `estimate_confirmed_at` columns and their CHECKs never reach prod — it was
  reversed before deploying. All widening or additive — existing rows keep
  their prices, no backfill — but the deploy breaks without it: intake inserts
  NULL for a blank Repair line (NOT NULL violation → every Repair checkout
  500s) and the price set/correct endpoint writes `order_service_price_logs`
  (missing table → 500).
  Prod checked 2026-08-25: `order_service_price_logs` exists, both `price`
  columns are nullable with no default. Nothing left to push.
- [x] **`push:prod` before next prod deploy** (verified applied 2026-08-25) —
  product-refund schema guards
  (`order_refund_items_line_xor_check` CHECK + `order_refund_items_product_uidx`
  partial unique index) exist only in dev. They are the only concurrency guards
  for product refunds. (§8) Now also includes the **product-cancel** columns +
  CHECKs from ADR-0008 (`order_products.cancelled_at`/`cancel_reason`/`cancel_note`
  + `order_products_cancel_refund_xor_check`,
  `order_products_cancel_reason_required_check`,
  `order_products_cancel_other_reason_requires_note_check`).
  Prod checked 2026-08-25 via `pg_constraint` / `pg_indexes` — the CHECK, the
  partial unique index, all three `cancelled_at`/`cancel_reason`/`cancel_note`
  columns and all three cancel CHECKs are present. Nothing left to push.
  Note `--explain` would not have shown any of these; they were confirmed by
  querying the catalogs directly.
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

## Prod schema drift (opened 2026-08-25, from the orders/:id outage)

- [x] **Drop `playing_with_neon` from prod** (done 2026-08-25) — Neon's stock sample table, created
  with the project and never used by us. Drizzle reports it non-empty, so it sits
  in every `explain:prod` plan as a `DROP TABLE` data-loss warning attached to
  whatever unrelated change is being shipped. Confirm it is the stock sample rows,
  then drop it deliberately: `DROP TABLE playing_with_neon;` via `bun -e`. Not
  urgent; the point is to stop a destructive statement riding along with the next
  deploy.
  Confirmed as the stock seed before dropping — `(id integer, name text, value
  real)`, 10 rows of `LEFT(md5(1..10), 10)` + `random()`, no foreign keys
  referencing it, absent from `schema.ts` and the codebase. Rows dumped as
  restorable INSERTs first. `explain:prod` no longer carries a `DROP`.
- [x] **Normalise the `pickup_code` default in `schema.ts`** (done 2026-08-25, PR #99) — phantom diff.
  Postgres stores the default in its own normalised form, and drizzle compares raw
  text, so `explain:prod` always reports a change:
  `lpad(floor(random() * 1000000)::text, 6, '0')` (schema.ts:477) vs
  `lpad((floor((random() * (1000000)::double precision)))::text, 6, '0'::text)`
  (prod). Behaviourally identical — applying it is a no-op. Paste Postgres's form
  into `schema.ts` so future plans come back clean. Cosmetic, but it is noise on
  top of the deploy check that is supposed to be read carefully.
  With this and the drop above, `explain:dev` and `explain:prod` both report no
  changes — the plan is now a real signal.

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
