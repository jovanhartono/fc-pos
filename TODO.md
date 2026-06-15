# TODO

## Architecture-deepening follow-ups (extracted 2026-06-10, source: docs/architecture-deepening.md)

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
