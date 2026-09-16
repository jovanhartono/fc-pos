# TODO

## Intake channel + origin postal code (shipped 2026-09-10, ADR-0020)

Built on `worktree-feat-out-of-town-orders`. Everything in
[ADR-0020](docs/adr/0020-intake-channel-and-origin-postal-code.md) is
implemented: the `postal_codes` table and the 9,999 reference rows that ship
with it as a data migration, the `intake_channel` enum with its backfill and
two CHECK constraints, `orders.origin_postal_code`, the POS picker, the
order-detail correction dialog, and the Origin reports panel.

- [ ] **Verify both CHECKs landed in prod** — `drift` does not diff CHECK
  constraints, so query `pg_constraint` for `intake_channel_courier_check` and
  `walk_in_has_no_origin_check` after migrating.

Deliberately out of scope, decided not forgotten: the return leg (return
shipping fee, airway bill, pickup with no customer at the counter) and asking
walk-ins where they came from. See ADR-0020 Consequences.

Known limits of the data, recorded so nobody re-derives them: 69 of 9,999 codes
straddle two kota/kabupaten and are assigned to whichever holds most of their
villages; 609 cover several kecamatan, which is why `districts` is display and
search only and never a grouping key.

## Report-stack consolidation (from 2026-07-06 simplification grill)

- [x] **Unify "services processed" definition** (done 2026-09-12) — one query in
  `modules/reports/services-processed.ts` answers both panels: first arrival at
  `quality_check` per OrderService, the stretch tested in `HAVING` against that
  first arrival, so a line re-checked in a later month stays in the month it was
  first checked. `fetchCompletions` and `ITEM_PROCESSED_STATUSES` are gone.
- [x] **Finish the metric rename in the code** (done 2026-09-12) — the daily KPI
  ships `services_processed` and worker productivity ships `services_processed` /
  `services_per_hour` / `total_services_processed` / `avg_services_per_hour`.
  Breaking response renames, shipped with the web relabels in the same PR.
- [ ] **Merge the two report stacks** — `report.repository.ts` (daily/overview)
  and `report-range.repository.ts`/`report-range.service.ts` (7 range panels)
  duplicate paid revenue, refunds sum, category revenue, and orders_out (×4
  implementations), and bucket dates two different ways (hand-rolled
  `to_char AT TIME ZONE` vs `jakartaBucketExpr`). Extract shared query builders
  (the paid-window, store filter and money columns moved to
  `modules/reports/money-basis.ts` on 2026-09-12; both stacks import them, and
  what is left to merge is the two stacks themselves and their two bucketing
  styles); one bucketing util. Existing report tests stay green. **On hold** —
  ask before starting.
- [x] **Web voucher double-bookkeeping** (done 2026-07-31, PR #64) — the form
  field `appliedVouchers: {code, campaign}[]` is now the single home; the
  Zustand `resolvedVoucherEntries` slice and its mirror effects are deleted.

## Architecture-deepening follow-ups (extracted 2026-06-10, source: docs/architecture-deepening.md)

- [x] **Apply the ADR-0017 Item migration to PROD, then baseline prod onto
  migrations** — closed 2026-09-03. Prod's order-flow tables were wiped as test
  data and prod was baselined on drizzle migrations the same day, so the
  hand-run migration and its runbook had nothing left to migrate; both are
  deleted. The `orders.status` cancelled-sibling backfill went with it — there
  are no pre-fix rows left to correct.
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
- [x] **Integration-test DB strategy** (done 2026-09-13, PR #121) — six
  `*.integration.test.ts` suites run on PGlite at the `@/db` seam: pickup,
  settlement, reversal, photos, status machine, order read. Run through
  `bun run test` so `--isolate` keeps the module swap from leaking.
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

- [x] **Prod environment separation** (decided, shipped 2026-09-11, PR #118) —
  one bucket, `dev/` / `prod/` key prefixes from `STORAGE_PREFIX`, set per Vercel
  environment alongside `DATABASE_URL`. Seed data has its own `seed/` prefix.
