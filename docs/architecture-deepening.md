# Architecture Deepening — Multi-Session Plan

Tracking the `/improve-codebase-architecture` skill output. Seven candidates
identified to turn shallow modules into deep ones. Worked one candidate per
session, drop in here when resuming.

Vocabulary is from `~/.claude/skills/improve-codebase-architecture/LANGUAGE.md`
(module, interface, seam, depth, leverage, locality, deletion test). Domain
nouns from `CONTEXT.md` (Order, OrderService, Pickup, Reversal, etc.).

## Resume protocol

1. Read this file.
2. Read `CONTEXT.md` for domain terms, `docs/adr/*` for locked decisions.
3. Pick the next candidate (status table below). Order suggested: 3 → 5 → 6 → 2 → 4 → 7.
4. Re-enter the skill's grilling loop: present open design questions, get answers,
   implement, run type-check + lint + tests.
5. Update this file when a candidate flips to ✅.

Suggested order:

1. #1 OrderStateMachine — foundation. Unblocks 2/5/6.
2. #3 Permissions — independent, small, parallel-safe warm-up if you want a quick win.
3. #5 Pickup then #6 Reversal — slices of #2, each riding on #1's seam.
4. #2 split — by this point order-admin.service is mostly already split; finalize residual (queue + photo modules).
5. #4 Campaign eligibility — independent.
6. #7 shallow CRUD — policy call, defer.

## Status

| # | Candidate                                       | Status      | Notes |
|---|-------------------------------------------------|-------------|-------|
| 1 | Order Status Machine                            | ✅ Done      | See §1 |
| 2 | Split `order-admin.service.ts` by lifecycle     | ⬜ Pending   | Partially eased by #1; depends on #5 + #6 |
| 3 | Permissions module (ADR-0004 capability table)  | ✅ Done      | See §3 + ADR-0006 |
| 4 | Campaign eligibility → Campaigns module         | ⬜ Pending   | Independent |
| 5 | Pickup module (ADR-0005 invariants)             | ✅ Done      | See §5 |
| 6 | Reversal off-ramps (cancel + refund)            | ✅ Done      | See §6 |
| 7 | Collapse shallow CRUD services                  | ⬜ Pending   | Policy call, defer |
| 8 | Product refunds + `refund_status` fix           | ⬜ Pending   | Bug; independent, schema change |

Dependencies: **#1 must land before #5, #6, #2.** #3 / #4 / #7 / #8 are independent.

---

## §1 — Order Status Machine ✅

**Goal**: one module owns every status write on `orders` / `orders_services`
plus the audit-log entry. Replace scattered `recalculateOrderStatus` /
`recalculateOrderStatusDirect` with a single tx-agnostic seam.

**Home**: `packages/server/src/modules/orders/order-status-machine.ts`
(renamed from `order-fulfillment.ts`).

**Exports**

| Symbol                          | Role                                                   |
|---------------------------------|--------------------------------------------------------|
| `ORDER_SERVICE_TRANSITIONS`     | Transition graph; refund reachable from every non-terminal + picked_up |
| `ORDER_TERMINAL_SERVICE_STATUSES` | `["picked_up", "refunded", "cancelled"]`             |
| `isTerminalOrderServiceStatus`  | Set check                                              |
| `summarizeOrderFulfillment`     | Status counts (used by `order.repository.ts`)          |
| `deriveOrderStatus`             | Pure: children + product count → Order rollup          |
| `recomputeOrderRollup`          | Read children → write `orders.status` (tx-agnostic)    |
| `transitionOrderService`        | Public seam, non-terminal moves only. Rejects `picked_up` and `refunded`. Validates paid-cancel guard inline (ADR-0004). |
| `completePickup`                | Sibling-only seam for `→ picked_up`; called by Pickup module after writing `order_pickup_events`. Returns flipped IDs; caller compensates on partial. |
| `applyRefundTransition`         | Sibling-only seam for `→ refunded`; called by Reversal module after writing `order_refunds` + `order_refund_items`. |
| `DbExecutor`                    | `typeof db \| OrderTx` — single executor type for tx-agnostic calls |

**Transition map (current)**

```
queued            → processing, cancelled, refunded
processing        → quality_check, cancelled, refunded
quality_check     → qc_reject, ready_for_pickup, cancelled, refunded
qc_reject         → processing, cancelled, refunded
ready_for_pickup  → picked_up, refunded, cancelled
picked_up         → refunded                         (ADR-0004: refund after pickup)
refunded          → ∅
cancelled         → ∅
```

**Behavior changes vs pre-refactor**

- QC redo must loop through `qc_reject` (no direct `quality_check → processing` shortcut). Audit log captures every redo.
- `refunded` reachable from every non-terminal + `picked_up` (was only `ready_for_pickup`). Honest map per ADR-0004.
- Paid-order cancel guard now centralized inside `transitionOrderService`, not re-asserted per handler.

**Ported call sites**

| Handler                          | What changed |
|----------------------------------|--------------|
| `startOrderServiceWork`          | Handler-axis writes kept inline; status writes via `transitionOrderService`. |
| `updateOrderServiceStatus`       | Removed inline `picked_up` reject + inline transition map check + inline paid-cancel guard + inline status log + inline recalc — all in `transitionOrderService`. Auto-claim handler-axis stays. |
| `createOrderPickupEvent`         | Pickup-code validation, `order_pickup_events` write, compensating rollback stay. Status flip + log + recalc via `completePickup`. |
| `createOrderRefund`              | Refund row writes stay. Per-service status flip + log + recalc via `applyRefundTransition`. Removed pre-check on status (state machine handles). |
| `cancelOrder`                    | Per-OrderService loop calling `transitionOrderService(to: "cancelled")`. Order-level `cancelled_at` write stays. Batch update + log inlined approach replaced. |

**Tests**: `order-status-machine.test.ts` — 19 unit tests via `bun:test`,
cover derive branches, transition map invariants, terminal set,
fulfillment summary. Integration tests deferred (needs test-DB strategy).

**External name change**: `ORDER_STATUS_TRANSITIONS` renamed to
`ORDER_SERVICE_TRANSITIONS` (re-exported through `@fresclean/api/schema`).
Web consumers updated:
- `apps/web/src/features/orders/components/queue-service-detail.tsx`
- `apps/web/src/routes/_admin/orders.$orderId.tsx`

**CONTEXT.md additions**: "Order Status Machine" glossary entry under
"Order lifecycle"; QC redo flow note appended to "OrderService status".

**Outcomes**
- `order-admin.service.ts`: 1506 → 1282 lines (−15%).
- Status writes through one seam.
- Map honest about ADR-0004.

---

## §2 — Split `order-admin.service.ts` ⬜

**Problem**: 802 lines (down from 1506; −#1, −#5, −#6) now spanning queue +
handler + photo + payment. Pickup and reversal are out.

**Plan**: extract `order-queue.service.ts` and `order-photo.service.ts`.
Maybe collapse `updateOrderPayment` into a small `order-payment.service.ts`
or leave it.

**Unblocked**: #5 + #6 both landed (pickup → `order-pickup.service.ts`, reversal →
`order-reversal.service.ts`). No remaining prerequisite — this is now the next
natural candidate.

---

## §3 — Permissions module ✅

**Goal**: encode the ADR-0004 capability matrix as code in a single
module. Replace scattered `assertIsAdmin` copies + misnamed
`assertCanProcessPaymentOrRefund`. Audit and align call sites with the matrix.

**Home**: `packages/server/src/modules/permissions/permissions.ts`. Single file.
Pure (no DB). Parallel to `utils/authorization.ts` (store-scoping, DB-reading)
as two modules with disjoint concerns. See [ADR-0006](adr/0006-permissions-module-shape.md).

**Exports** (all throw `ForbiddenException`; convention `assertCan*`)

```ts
// Role-only (no Order needed)
assertIsAdmin(user)
assertCanManageCampaigns(user)        // admin
assertCanManageUsers(user)            // admin
assertCanReassignHandler(user)        // admin
assertCanCreateOrder(user)            // cashier, admin
assertCanProcessPayment(user)         // cashier, admin (renamed from PaymentOrRefund)
assertCanProcessPickup(user)          // admin || cashier-with-can_process_pickup
assertCanSelfAssign(user)             // worker
assertCanProcessOrderService(user)    // worker, admin
assertCanUploadServicePhotos(user)    // worker, admin

// Order-aware (caller loads Order, passes in)
assertCanCancelOrderService(user, order)  // cashier/worker/admin + payment_status='unpaid'
assertCanRefundOrderService(user, order)  // admin + payment_status='paid'
```

**Behavior changes vs pre-refactor**

- `cancelOrder` now allows cashier/worker on unpaid Orders per ADR-0004 (was admin-only at server level).
- Refund/cancel payment-status mismatch throws `ForbiddenException` (403) via permissions, not `BadRequestException` (400). Payment-status is now treated as a permission concern (split-responsibility with state machine).
- `updateOrderServiceStatus` rejects `cancelled`/`refunded` for **all** roles (was worker-only). Terminal exits must use dedicated cancel/refund endpoints.
- 4 previously-ungated ADR-0004 rows now wired: createOrder, self-assign, updateOrderServiceStatus, upload service photos.
- 5th user-route (`PUT /admin/users/:id/stores`) gained the missing admin check.

**Ported call sites**

| Handler / Route                                | What changed |
|------------------------------------------------|--------------|
| `campaigns/campaign.service.ts`                | Local `assertIsAdmin` deleted; `createCampaign` / `updateCampaign` / `deleteCampaign` call `assertCanManageCampaigns`. |
| `orders/order-admin.service.ts:updateOrderPayment` | `assertCanProcessPaymentOrRefund` → `assertCanProcessPayment` (rename, name no longer lies). |
| `orders/order-admin.service.ts:updateOrderServiceHandler` | `assertIsAdmin` → `assertCanReassignHandler`. |
| `orders/order-admin.service.ts:createOrderRefund` | Inline `assertIsAdmin` + `BadRequestException` payment-status check both removed; replaced by `assertCanRefundOrderService(user, order)` after Order load. |
| `orders/order-admin.service.ts:cancelOrder` | Inline `assertIsAdmin` + `BadRequestException` payment-status check both removed; replaced by `assertCanCancelOrderService(user, order)` after Order load. |
| `orders/order-admin.service.ts:startOrderServiceWork` | Added `assertCanSelfAssign(user)` (was ungated). |
| `orders/order-admin.service.ts:updateOrderServiceStatus` | Added `assertCanProcessOrderService(user)`; inline worker-only cancel/refund check widened to all roles. |
| `orders/order-admin.service.ts:saveOrderServicePhoto` | Added `assertCanUploadServicePhotos(user)`. |
| `orders/order-admin.service.ts:createOrderPickupEvent*` | Local `assertCanProcessPickup` deleted; imported from permissions. |
| `routes/admin/orders.ts:POST /` | Route-layer `assertCanCreateOrder(user)` (createOrder service signature unchanged). |
| `routes/admin/orders.ts:POST /:id/services/:serviceId/photos/presign` | Route-layer `assertCanUploadServicePhotos(user)` (presign service signature unchanged). |
| `routes/admin/users.ts` | Context-shape `assertIsAdmin(c)` deleted; every route extracts `user` from JWT and calls `assertCanManageUsers(user)`. 5th route (`PUT /:id/stores`) gained the missing check. |

**Tests**: `permissions.test.ts` — 21 unit tests via `bun:test`, one
describe per function, covering role-allow / role-deny / payment-status-allow /
payment-status-deny. Full server suite 80/80 pass.

**Outcomes**
- 13 `assertCan*` functions in one file = ADR-0004 matrix as code.
- Server matches matrix on day one (no documented capability the code disagrees with).
- 4 previously-silent permission gaps closed.
- Misnamed `assertCanProcessPaymentOrRefund` retired.

**Follow-ups (not in this PR)**
- Web cancel button gate — verify cashier/worker can actually reach `cancelOrder` from the UI now that the server allows them. If UI is admin-only-rendered, no user-facing change; if not, document the policy alignment.
- `adminMiddleware` is JWT-only despite its name — rename when other middleware work touches it.

---

## §4 — Campaign eligibility → Campaigns ⬜ (independent)

**Problem**: `order.service.ts:120-193` (`loadAndValidateCampaigns`,
`assertCampaignUsable`) lives in Order. Campaigns module owns CRUD only,
not eligibility. Future POS price-preview would duplicate the rules.

**Sketch**: move both into `campaigns/campaign.service.ts` as
`loadApplicableCampaigns({ campaignIds, storeId, serviceIds, subtotal, when })`.
Returns ready-to-apply Campaigns or typed validation error.

**Design questions**
- Return shape: `{ applicable: Campaign[]; rejected: Array<{ id, reason }> }`
  vs throw-on-first-rejection. POS price-preview may want non-throwing.
- Subtotal computation: caller passes, or campaigns module re-derives from
  service IDs?

---

## §5 — Pickup module ✅

**Goal**: gather every pickup-code / pickup-event invariant (ADR-0005) into one
module so the picked-up transition reads end-to-end in one place, instead of
living inside the giant `order-admin.service.ts`.

**Home**: `packages/server/src/modules/orders/order-pickup.service.ts`. Single file.

**Scope correction**: the original sketch listed the drop-off photo handler as a
third pickup site ("misleadingly-named"). It is **not** pickup — drop-off photo is
an **intake** concern (writes `orders.dropoff_photo_*`, no ADR-0005 logic). It
stayed in `order-admin.service.ts`. The Pickup module owns only the two genuinely
pickup handlers. `saveOrderDropoffPhoto`'s name was accurate all along.

**Exports**

| Symbol                          | Role |
|---------------------------------|------|
| `createOrderPickupEvent`        | Full pickup flow: code-validate → readiness check → (tx) insert `order_pickup_events` + `completePickup`. |
| `createOrderPickupEventPresign` | Pickup-photo upload URL (gated by `assertCanProcessPickup`). |

Private `assertPickupCodeMatches(order, code)` names the ADR-0005 per-Order code rule.

**Behavior changes vs pre-refactor**

- Pickup writes now run inside a real `db.transaction`. The hand-rolled
  compensating rollback (manual event-delete + service-reset on partial flip / error)
  is deleted — the transaction rolls back automatically. No external behavior change:
  same validations, same error messages, same concurrency guard (a concurrent pickup
  leaves a short flip from `completePickup` → throw → rollback).
- Names kept (`createOrderPickupEvent` / `createOrderPickupEventPresign`) — accurate,
  no rename churn into routes.

**Ported call sites**

| Handler / Route | What changed |
|-----------------|--------------|
| `routes/admin/orders.ts` | The two pickup imports repointed from `order-admin.service` to `order-pickup.service`. Route bodies unchanged. |
| `orders/order-admin.service.ts` | Both pickup functions removed; orphaned imports (`orderPickupEventsTable`, `completePickup`, `assertCanProcessPickup`, the two pickup input types) cleaned. 1249 → 1106 lines (−11%). |

**Schema (ADR-0005 "Outstanding fix" landed)**

- Added CHECK `order_services_picked_up_requires_event_check`:
  `status != 'picked_up' OR pickup_event_id IS NOT NULL`. The picked-up transition is
  now DB-enforced, not just application-enforced. Applied to dev via `push:dev` (this
  repo uses the push workflow — `drizzle/dev` has no migration journal, only a pulled
  snapshot). A read-only data-safety query confirmed **0** violating rows before apply.
- ADR-0005 updated to mark the gap resolved.

**Tests**: existing suite 42/42 pass; server type-check + biome clean. Pickup-flow
integration tests deferred (needs a test-DB strategy, same as #1).

**Outcomes**
- `order-admin.service.ts` shrinks; pickup logic readable in one 145-line file.
- ADR-0005 invariant promoted from code-only to schema-enforced.
- Manual compensating-rollback retired in favor of a transaction.

---

## §6 — Reversal off-ramps ✅

**Goal**: gather the two Order off-ramps (cancel + refund) into one module so the
reversal paths read in one place, out of the giant `order-admin.service.ts`.

**Home**: `packages/server/src/modules/orders/order-reversal.service.ts`. Single
file, peer of `order-pickup.service.ts`.

**Scope correction — no shared scaffold**: the original sketch proposed an internal
`applyTerminalExit` shared between cancel and refund, plus a payment-status gate "at
module entry." Dropped after reading the code. Cancel and refund only *rhyme*
("both terminal"); the concrete shared part — flip status + write status-log +
recompute rollup — already lives in #1's seams (`transitionOrderService` for cancel,
`applyRefundTransition` for refund). The payment-status gate already lives in #3's
permissions (`assertCanCancelOrderService` = unpaid, `assertCanRefundOrderService` =
paid). A new `applyTerminalExit` would either bypass those seams (re-implement
transition validation = regression) or wrap them with no added logic (fails the
deletion test). So #6 is **relocation-only** — the win is locality, not a new
abstraction.

**Exports** (names kept — only `routes/admin/orders.ts` imports them; rename = churn)

| Symbol              | Role |
|---------------------|------|
| `createOrderRefund` | Refund flow: dup-check → caps → largest-remainder allocation → cap check → (tx) bump `refunded_amount` + insert `order_refunds`/`order_refund_items` + `applyRefundTransition`. |
| `cancelOrder`       | Cancel flow: load non-terminal services → (tx) per-service `transitionOrderService(to:'cancelled')` + write `cancelled_at`. |

Private to the module: `buildRefundItems` (largest-remainder rounding),
`getOrderLineRefundCaps` (per-line discount allocation + already-refunded netting),
`roundCurrencyUnit`. All three were refund-only; verified used nowhere else before
moving.

**Behavior changes vs pre-refactor**: none. Pure relocation — same validations,
same error messages, same transactions, same permission gates. No status-machine or
schema change.

**Ported call sites**

| Handler / Route | What changed |
|-----------------|--------------|
| `routes/admin/orders.ts` | The two reversal imports repointed from `order-admin.service` to `order-reversal.service`. Route bodies unchanged. |
| `orders/order-admin.service.ts` | `createOrderRefund`, `cancelOrder` + 3 private refund helpers removed; orphaned imports cleaned (`orderRefundItemsTable`, `orderRefundsTable`, `applyRefundTransition`, `assertCanCancelOrderService`, `assertCanRefundOrderService`, the two reversal input types). 1106 → 802 lines (−27%). |

**Tests**: existing suite 42/42 pass; server type-check (3/3 turbo tasks) + biome clean.

**Outcomes**
- Reversal reads end-to-end in one 319-line file.
- `order-admin.service.ts` down to 802 lines (queue + handler + photo + payment).
- #2 (split) now fully unblocked — pickup and reversal both carved out.
- Rejected the sketch's `applyTerminalExit`: #1 seams + #3 permissions already own
  everything it would have wrapped.

---

## §7 — Collapse shallow CRUD services ⬜ (policy call)

**Problem**: `product.service.ts`, `service.service.ts`,
`payment-method.service.ts` are 31-32 lines of pure passthroughs to their
repositories. Interface ≈ implementation. By LANGUAGE.md: shallow modules
that cost cognitive load without leverage.

**Two options**
- (a) Delete the service files; routes call repositories directly.
  Document the trivial-CRUD exception to the 3-layer rule.
- (b) Add real orchestration (validation, derived shape) so the layer earns
  its keep.

**Recommendation**: defer until either (1) we find ourselves repeatedly
needing pre-DB validation on these domains, or (2) someone tries to read a
Product mutation path and is annoyed by the extra hop. Either signal picks
the option. Today there's no signal.

---

## §8 — Product refunds + `refund_status` fix ⬜

**Bug**: `orders.refund_status` is derived from money (`deriveOrderRefundStatus` in `order-refund-status.ts`): `none` / `partial` / `full` based on `refunded_amount` vs `paid_amount`. The refund flow (`createOrderRefund` + `getOrderLineRefundCaps` in `order-admin.service.ts`) iterates **services only** — products are not refundable in v1. But `paid_amount` includes products (`total = serviceSubtotal + productSubtotal`, `order.service.ts:414`). So any Order containing products will hit `partial` and stay there forever after all services are refunded. UI badge ("Fully Refunded" in `apps/web/src/lib/status.ts:58-62`) reads `partial` and operators cannot advance it.

**Reproduction**: 1 service (80k) + 1 product (20k), discount 0, paid_amount = 100k. Refund the service → `refunded_amount = 80k`. Badge stuck on "Partially Refunded" with no further action available.

**Decision**: extend refund flow to cover product lines so money-axis can reach `full`. Products become refundable line items alongside services; refund dialog gains a product picker; `getOrderLineRefundCaps` (or successor) iterates both `orders_services` and `orders_products`.

**Why not service-state-axis** (badge means "all services refunded", ignore money): products-only refund is on the roadmap, so we'd need a money signal eventually anyway. Also silently flips semantics under any existing report reader that interprets `full` as "money fully returned."

**Why not two badges**: UI noise; one fact should map to one badge.

**Why not exclude products from denominator** (compare `refunded_amount` to `paid_amount - productSubtotal`): lies about reality. Customer paid for products and didn't get the money back; "fully refunded" would be wrong.

**Schema scope**
- Either extend `order_refund_items` with optional `order_product_id` (mutually exclusive with `order_service_id`), or new `order_refund_products` table.
- `orders_products` gains a "refunded" marker — boolean `refunded_at` if no other product states are anticipated, enum otherwise.

**Open questions before implementing**
- Audit report queries reading `refund_status` for money-semantics assumptions. Flag any consumer treating `full` as "every line refunded."
- `refundReasonEnum` is service-shaped (`damaged`, `cannot_process`, `lost`, `other`, `customer_cancelled`). Apply unchanged to products, or new vocab?

**Until built**: badge is *accurate from a money perspective* — the product portion is genuinely unrefunded. Do not patch by flipping the badge to a service-state rule without revisiting the decision here.

**CONTEXT.md touchpoints** (rewrite when fix lands)
- `OrderRefund / OrderRefundItem` entry — "Products are not refundable in v1" claim, and the link back here.
- `Refund status` entry — bug description, and the link back here.

---

## Out of scope (recorded so we don't re-suggest)

- **Splitting OrderService status into two columns** (processing axis vs
  terminal-outcome axis): documented as accepted v1 trade-off in
  `CONTEXT.md` "OrderService status". Tied to the Order Status Machine
  refactor only by name; the column split is a separate, larger migration.
- **ADR-0005 declined items** (CSPRNG pickup code, UNIQUE on pickup_code):
  declined with reasons in ADR-0005. Do not re-propose.
- **Cancel/refund partial state, partial payment**: ADR-0001 (payment is
  binary) + ADR-0003 (business rules locked). Do not re-suggest.
