# Fresclean

Bun monorepo for a multi-store sneaker/footwear cleaning and restoration POS. The server (`packages/server`) owns the domain; the web app (`apps/web`) is the operator console.

**Operator devices.** Cashiers run the POS on store tablets (iPad-class). Workers run the queue/processing UI on Android phones. Admins use any browser. Device targets shape UI density and input affordances (e.g. camera intake, touch-first controls) but are **not** an authorization axis — role is. Where a capability differs, it differs by role, not by device.

## Language

### Catalog

**Service**:
A cleaning or restoration treatment in the catalog (e.g. "deep clean", "midsole whitening"). Shared across stores; ~50–75 lifetime.
_Avoid_: Treatment, package.

**Product**:
A physical SKU sold alongside services (laces, brushes). Has a single global `stock` column (not per-store; per-store stock is deferred — D-12). ~2–3 SKUs in v1.
_Avoid_: Merchandise, add-on.

**Category**:
Grouping for Services and Products. Used in reports (revenue is reported as Store × Category).

**Campaign**:
A discount rule with a date window, a minimum order total, and eligible Services, scoped to 0..N Stores (zero = valid at every Store). May be percentage or fixed amount. Multiple Campaigns may stack on one Order.
_Avoid_: Promo, voucher, coupon — these are all Campaigns.

**Usable (Campaign)**:
A Campaign is Usable for a given Store and order total at a moment in time when every rule passes: active, within its date window, Store in scope (or unscoped), and order total meets the minimum. The POS offers only Usable Campaigns; checkout rejects unusable ones.
_Avoid_: Available — the web's former term for a partial (2-of-4 rule) version of this check.

**PaymentMethod**:
A configurable tender (cash, transfer, QRIS, etc.). Same list across all Stores.

### Operators

**Store**:
A physical shop location. Owns its own Orders and Shifts. **Does not** own its own Product stock — `products.stock` is global across stores in v1 (per-store stock deferred — D-12). 6 stores today, ceiling ~50.
_Avoid_: Branch, outlet.

**User**:
An operator. Role is one of **admin**, **cashier**, **worker**, **courier**. Scoped to one-or-many Stores via `userStores`. Role gates **money and admin operations** only; the OrderService processing axis (queue claim, status updates, detail photos) is open to any staff regardless of role — see [ADR-0004 amendment](docs/adr/0004-role-capabilities-v1.md).

**Shift**:
A User's working session at a Store, with `clock_in`/`clock_out`. Used for attendance reporting and revenue-by-shift breakdown in `reports`. Shifts do **not** gate POS access — Order creation never reads shift state in v1.

**Courier** (`role = courier`):
A User whose job is **collecting** dropped-off items from the customer at intake and **delivering** finished items back after pickup. Logs in solely to open a Shift (attendance); does **not** operate the POS, the queue, or money. Deliberately excluded from the worker-productivity report — that report is an allowlist on `role = worker`, so a Courier never appears. Excluding Couriers from that report is the reason the role exists. See [ADR-0010](docs/adr/0010-courier-role-login-only-excluded-by-allowlist.md).
_Avoid_: delivery guy, driver, rider (informal only).

### Order lifecycle

**Order**:
A single intake: a Customer drops items at a Store, work is done on the items, items are picked up. The unit of payment, refund, cancellation, and lifecycle.
_Avoid_: Transaction (legacy folder name — see Ambiguities), sale, ticket.

**OrderService**:
**One pair of footwear receiving one Service.** Not one shoe — a pair is the unit. An Order has 1..N OrderServices. Each owns its own status, a single **current** handler (`handler_id`), detail photos, optional `item_code`, and an `is_priority` flag (defaults from `services.is_priority` on the catalog row, overridable per line at intake). The handler can be reassigned by an admin (staff cannot poach a peer's item — self-assign throws if `handler_id` is already set to someone else); every reassignment is appended to `order_service_handler_logs` with `from_handler_id`, `to_handler_id`, `changed_by`, and an optional note.
_Avoid_: Order item, line item, job (informal worker shorthand only).

**OrderProduct**:
A Product line in an Order. Decrements the Product's global `stock` at create (no per-store stock in v1 — see Product). No status, no handler, no photos. Reversible whole-line, at most once, down exactly one off-ramp set by the Order's `payment_status`: **paid → refund** (marked by `refunded_at`, money-only, does **not** restore stock — goods left the shop) or **unpaid → cancel** (marked by `cancelled_at`, **restores stock** — goods never left). The two markers are mutually exclusive. See [ADR-0007](docs/adr/0007-product-refunds-whole-line-money-only.md) and [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md).

**OrderRefund** / **OrderRefundItem**:
A post-payment reversal recorded against an Order. Created only when `payment_status = paid`, by an admin, via the refund dialog. One OrderRefund per refund event; one OrderRefundItem per refunded line — **exactly one of** an OrderService or an OrderProduct — each carrying a `refundReasonEnum` value chosen by the admin (the reason vocabulary is shared across both line kinds). Service lines may refund partially across multiple events; product lines refund **whole-line, at most once** — see [ADR-0007](docs/adr/0007-product-refunds-whole-line-money-only.md). Money movement is **out of band** — the POS records state only. The refund dialog offers both service and product lines ([architecture-deepening §8](docs/architecture-deepening.md)).

**OrderPickupEvent**:
A collection event. **Multiple events per Order are allowed** (partial pickup). **Payment precedes pickup** — the Order must be fully paid (`payment_status = paid`) before *any* pickup event may be created, partial or not. Enforced server-side; the pickup dialog will not record a collection on an unpaid Order. (Added 2026-06-15.)

**Pickup code**:
A 6-digit code on each Order. Generated by a PostgreSQL DB-side default (`random()`) at insert — **deliberately DB-side, not app-side**. Customer reads it from the public `/track` page (visible only when `ready_for_pickup`) and gives it to the cashier; cashier enters it in the pickup dialog; server validates the code matches **this specific Order** before transitioning to `picked_up`. The code is a per-Order verification (the cashier already opened the Order), not a cross-Order discovery key — it is **deliberately not UNIQUE** in the schema. App-layer generation (CSPRNG) and UNIQUE-with-retry were both considered and declined; see [ADR-0005](docs/adr/0005-pickup-code-authentication.md) for the trade-off and the one outstanding CHECK-constraint fix.

**Order status**:
A single `orderStatusEnum` column on `orders` (`created`, `processing`, `ready_for_pickup`, `completed`, `cancelled`) that is **derived**, not authored. The server recalculates it from the Order's OrderService statuses and OrderProduct line states after any state change via `deriveOrderStatus` in `order-status-machine.ts`:

- **No active OrderServices.** Roll up over **every** line — services *and* products. `cancelled` only if **every** line is cancelled (each service `cancelled` and each product `cancelled_at` set); `created` if there are no lines at all; otherwise `completed` (any `picked_up`, `refunded`, or live product line means real activity landed — a products-only Order with no cancellations is born completed). See [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md).
- **Some OrderServices terminal, others active.** If every non-terminal OrderService is `ready_for_pickup`, Order is `ready_for_pickup` — this is the partial-pickup mid-state (some items already collected, rest waiting at counter).
- **All OrderServices active.** If every active OrderService is `ready_for_pickup`, Order is `ready_for_pickup`. Else if any service has moved past `queued`, Order is `processing`. Else `created`.

Order status is never written directly by handlers; it is always recomputed from the truth-source (OrderService statuses + OrderProduct line states). Do not bypass the recalculation path.

**Refund status** (`orders.refund_status`):
A second derived field on Order, separate from Order status. Computed from money, not service states, by `deriveOrderRefundStatus`: `none` when `refunded_amount = 0`, `full` when `refunded_amount >= paid_amount`, `partial` otherwise. Surfaces as the "Fully Refunded" / "Partially Refunded" badge on the order detail page. Since product lines became refundable ([ADR-0007](docs/adr/0007-product-refunds-whole-line-money-only.md)), every paid line can return its money and `full` is reachable for Orders containing products (previously they were stuck on `partial` forever — see [architecture-deepening §8](docs/architecture-deepening.md)). The badge stays a money fact; do not reinterpret it as a service-state rule.

**OrderService status**:
A single `orderServiceStatusEnum` column on `orders_services` that conflates two axes for v1:

- **Processing axis** — `queued → processing → quality_check → (qc_reject → processing | ready_for_pickup) → picked_up`. QC redo always loops through `qc_reject` (no direct `quality_check → processing` shortcut) so every redo is auditable in `order_service_status_logs`. `picked_up` is the success terminal; the transition is gated by pickup-code validation in the pickup dialog and is never settable from a generic status dropdown.
- **Terminal-outcome axis** — `cancelled` and `refunded` are exit states gated by the Order's `payment_status` (unpaid → `cancelled`, paid → `refunded`). See [ADR-0004](docs/adr/0004-role-capabilities-v1.md). Reading these values loses the processing step the OrderService was in at the moment of exit; reconstruct from `order_service_status_logs` if needed.

Splitting the two axes into separate columns is a recorded follow-up tied to the Order Status Machine refactor; v1 ships with the conflated encoding.

**Order Status Machine**:
One module owns every status write on `orders` and `orders_services`, plus the matching audit-log entry. Lives at `packages/server/src/modules/orders/order-status-machine.ts`. It holds:

- `deriveOrderStatus` — pure function. Children OrderService statuses + product count → Order rollup status.
- `transitionOrderService` — public seam for non-terminal status changes. Looks up the transition graph (`ORDER_SERVICE_TRANSITIONS`), rejects illegal moves, writes the row + status-log entry + recomputed Order rollup. Refuses `picked_up` and `refunded`; callers must use the sibling-only seams below. Refuses `cancelled` when Order is paid (per ADR-0004 disjoint off-ramps).
- `completePickup` / `applyRefundTransition` — sibling-only seams for terminal transitions. The Pickup module calls `completePickup` **after** writing `order_pickup_events`; the Reversal module calls `applyRefundTransition` **after** writing `order_refunds` + `order_refund_items`.

All status writes go through this module. Do not write `orders_services.status` or `orders.status` directly from a handler.

_Avoid_: "order status service," "transition helper."

### Customer

**Customer**:
The person who placed the Order. `phone_number` is **UNIQUE** — duplicate phone on create returns the existing Customer.

### Photos

**Drop-off photo**:
One per Order, captured on the store iPad at intake. **Required at intake** — the POS blocks checkout until one is attached. Captured before the Order exists and attached immediately after checkout commits; still replaceable later on the order detail page. Not a hard invariant: if the post-checkout attach fails, the Order can briefly exist without one, surfaced as "Missing" on the detail page for retry. (Was "Non-blocking" pre-2026-06-15.)

**Service detail photo**:
N per OrderService, no cap, captured during processing on the worker phone. Optional per-photo note.

**Pickup photo**:
Captured per OrderPickupEvent, **blocking** at the picked-up transition.

All three types are soft-deleted (`deleted_at`). S3 objects are retained forever.

### Operator views (web-only)

**Cart**:
Ephemeral client-side construct in the Transactions POS. Holds in-progress OrderServices, OrderProducts, applied Campaigns, and chosen PaymentMethod. **Becomes an Order only when checkout succeeds.** Nothing persists server-side until then.

**Queue**:
The view of OrderServices needing work, scoped by Store, filtered by status. Used mainly by workers; any staff may self-assign `queued → processing` (processing axis is role-open — see [ADR-0004 amendment](docs/adr/0004-role-capabilities-v1.md)). Sort order is `is_priority DESC, Order.created_at ASC, OrderService.id ASC` — priority items bubble to the top; otherwise FIFO by intake time. `is_priority` carries no SLA or pricing effect; it is purely a queue-bumper.

**Aging queue**:
A Reports tab listing OrderServices not in a terminal status, ordered by `created_at` ascending.

**Transactions POS**:
The cashier UI at `/transactions` for creating Orders. (See Ambiguities — "Transaction" is the legacy folder name.)

## Relationships

- A **Customer** places an **Order** at one **Store**.
- An **Order** contains 1..N **OrderServices** and 0..N **OrderProducts**.
- Each **OrderService** represents one pair receiving one Service; one **User** (worker) is the current handler at any time. Admin may reassign; reassignments are logged in `order_service_handler_logs`.
- An **Order**'s status is **derived** from its **OrderService** statuses plus **OrderProduct** line states — never authored. See "Order status" for the rollup rule.
- An **Order** may have 0..N **OrderPickupEvents** — partial pickup permitted.
- An **Order** may record the **Courier** who collected its items at intake (`orders.collected_by`, nullable FK → a `role = courier` User). A non-null value marks the Order as collected via delivery rather than walk-in; null = walk-in. There is no separate "is delivery" boolean — the Courier reference **is** the marker. Records **intake** only (collection), not return delivery. See [ADR-0010](docs/adr/0010-courier-role-login-only-excluded-by-allowlist.md).
- Cancel and refund are **disjoint, per-line off-ramps** gated by the Order's `payment_status`: unpaid → cancel only; paid → refund only. Both are **per-line** (staff/admin pick which OrderServices and OrderProducts to reverse) and both cover service **and** product lines; the only differences are the trigger (`payment_status`), the reason enum (`cancelReasonEnum` vs `refundReasonEnum`), money movement (none on cancel), and stock (cancel restores, refund does not). There is no auto-cascade between them. See [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md).
- A **Campaign** is scoped to 0..N **Stores** (zero = all Stores) and targets 1..N **Services**.
- A **User** is scoped to 1..N **Stores** and opens a **Shift** to take payments at one Store at a time.

## Example dialogue

> **Dev:** "Customer pays half today, half at pickup — how do we record it?"
> **Domain expert:** "We don't. Payment is binary. Split into two Orders — one paid, one unpaid." (See [ADR-0001](docs/adr/0001-payment-is-binary.md).)

> **Dev:** "Customer wants to collect three of their five OrderServices today, the rest tomorrow. Block them?"
> **Domain expert:** "Allowed. Record an OrderPickupEvent for the three; Order stays open until the rest are collected." (See [ADR-0003](docs/adr/0003-business-rules-locked-2026-04-28.md).)

> **Dev:** "Worker can't process an OrderService on a paid Order — what's the path?"
> **Domain expert:** "Worker can't cancel a paid Order. Worker flags it; an admin opens the refund dialog and refunds that OrderService with the appropriate reason. Cancel and refund are disjoint off-ramps — cancel is unpaid-only, refund is paid-only." (See [ADR-0004](docs/adr/0004-role-capabilities-v1.md).)

> **Dev:** "The Cart in the Transactions POS — is that an Order yet?"
> **Domain expert:** "No. Client-side only. It becomes an Order when checkout commits."

## Flagged ambiguities

- **"Transaction"** — the web folder `apps/web/src/features/transactions/`, route `/transactions`, and Zustand store `transactions-store.ts` use the word as a legacy shorthand for *the create-Order flow*. **Resolution:** the canonical noun is **Order**. "Transactions POS" is acceptable as a UI surface name; do not use "transaction" to mean a row in `orders`, a refund, or any persisted object. New code should prefer **Order** wherever possible; rename folders/files in passing when work touches them — no dedicated rename PR planned.

- **"Branch" vs "Store"** — early product discussion used "branch"; schema, code, and UI now use **Store**. Use Store everywhere.

- **"Job" vs "OrderService"** — worker UI informally says "job" (e.g. "next job"). Canonical noun is **OrderService**. "Job" is colloquial shorthand only — never use in schemas, types, or docs.

- **Cancel granularity** — v1 shipped a **whole-Order** cancel (`cancelOrder` voided every cancellable OrderService at once) while the team's mental model was **per-line** cancel (the unpaid twin of refund). The two looked identical only because most Orders carry a single OrderService. **Resolution:** cancel is **per-line**, symmetric with refund — see the off-ramp relationship above and [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md). Do not describe cancel as an all-or-nothing Order-level action.
