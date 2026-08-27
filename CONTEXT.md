# Fresclean

Bun monorepo for a multi-store cleaning, restoration, and repair POS. The shop takes in **footwear, bags, hats, and luggage** — the unit of work is an **Item**, deliberately not "a pair", because most of what comes over the counter is not one. The server (`packages/server`) owns the domain; the web app (`apps/web`) is the operator console.

**Operator devices.** Cashiers run the POS on store tablets (iPad-class). Workers run the queue/processing UI on Android phones. Admins use any browser. Device targets shape UI density and input affordances (e.g. camera intake, touch-first controls) but are **not** an authorization axis — role is. Where a capability differs, it differs by role, not by device.

## Language

### Catalog

**Service**:
A cleaning or restoration treatment in the catalog (e.g. "deep clean", "midsole whitening"). Shared across stores; ~50–75 lifetime. All but one carry a list price; see **Repair**.
_Avoid_: Treatment, package.

**Repair**:
The one Service with **no list price**. What it costs depends on how much of the object has to be replaced — a toebox leather patch and a whole re-panel are the same Service at very different prices — so the number is determined per Item by inspection, never read off the catalog. Splitting Repair into narrower catalog rows would not remove this: the variance lives *inside* a job type, not between job types. At intake the line's price is left **blank** — the Order is still created in full (tag, drop-off photo, Receipt) — and filled in after inspection, typically agreed with the Customer over WhatsApp. **No price, no payment**: an Order with any non-cancelled unpriced line cannot be marked paid. Repair spend counts toward Campaign minimums like any other line — a discount settles once every line is priced, so a Repair's number is final before any promo reads it — with one exclusion: a no-list-price line can never be a buy-one-get-one free slot. See [ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md).
_Avoid_: restoration (the whole category of work, not this Service), fix, overhaul (one instance of Repair, not a distinct Service), **Estimate** (retired — see Ambiguities).

**Product**:
A physical SKU sold alongside services (laces, brushes). Has a single global `stock` column (not per-store; per-store stock is deferred — D-12). ~2–3 SKUs in v1.
_Avoid_: Merchandise, add-on.

**Category**:
Grouping for Services and Products. Used in reports (revenue is reported as Store × Category).

**Campaign**:
A discount rule with a date window, a minimum order total, and eligible Services, scoped to 0..N Stores (zero = valid at every Store). May be percentage or fixed amount. Multiple Campaigns may stack on one Order. **A discount settles once every line on the Order is priced** — at drop-off for an ordinary Order, after inspection for one carrying a Repair. Every rule is checked against the order total at that moment, and the redemption is claimed then. An Order with any non-cancelled unpriced line carries discount 0 and claims nothing. If a later cancellation or downward price correction drops an unpaid Order below an attached Campaign's minimum, **every** promo on it is voided and the cashier re-applies what still qualifies ([ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md)). Redeemed one of two ways, set by its **redemption mode**: **listed** (offered in the POS list and picked by the cashier — the default) or by **code** (a Voucher — not listed; the cashier types a code). A listed Campaign may carry a **usage limit**; a code Campaign is a Voucher. See [ADR-0015](docs/adr/0015-campaign-usage-limit-and-vouchers.md).
_Avoid_: Promo, coupon — these are Campaigns. **Voucher** is not a separate concept: it is a code-mode Campaign (see Voucher).

**Usable (Campaign)**:
A Campaign is Usable for a given Store and order total at a moment in time when every rule passes: active, within its date window, Store in scope (or unscoped), and order total meets the minimum. Usage limits and Vouchers add two more gates: a listed Campaign at its **usage limit** is not Usable, and a Voucher additionally requires a matching, unredeemed **Voucher code**. The POS offers only Usable *listed* Campaigns; a Voucher is applied by entering its code, validated the same way. The checks run — and reject unusable Campaigns — when the discount **settles**, i.e. once every line is priced ([ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md)). The order-total minimum is re-checked afterwards on any path that lowers an unpaid Order's total.
_Avoid_: Available — the web's former term for a partial (2-of-4 rule) version of this check.

**Voucher**:
A code-mode Campaign: a batch of **bearer, single-use codes** handed to specific people to redeem later. Not offered in the POS list — the cashier types a code at payment and the server resolves which Campaign it belongs to. Each code redeems exactly once, for whoever presents it (**not bound to a customer** — presenting the code is the only proof), and the batch size is the Campaign's effective cap. All codes in one Voucher share its discount, date window, Store scope, and eligible Services; deactivating or expiring the Campaign kills every code. See [ADR-0015](docs/adr/0015-campaign-usage-limit-and-vouchers.md).
_Avoid_: Coupon, gift card, promo code — a Voucher is a Campaign.

**Voucher code**:
One bearer, single-use string belonging to a Voucher. Globally unique across all Vouchers and deliberately **non-guessable** (a code is money — anyone holding it can redeem it). Minted when the Voucher is created; claimed atomically **when the discount settles on its Order** — once every line is priced — so it can never be spent twice. Attaching is claiming; payment does not re-resolve it. It goes back on the shelf if the Order is fully cancelled, or if a cancellation or downward correction drops the unpaid Order under the Campaign's minimum ([ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md)). A paid refund does not free it. See [ADR-0015](docs/adr/0015-campaign-usage-limit-and-vouchers.md).
_Avoid_: Coupon code, redemption key.

**Usage limit**:
An optional global cap on how many times a **listed** Campaign may be redeemed across all Orders and Stores (e.g. "the first 100 Orders"). Enforced atomically when the discount **settles** — concurrent Orders racing the last slot can never both win (the same guarantee Product stock has). A Voucher does not use this field; its cap is its code count. A slot is consumed from that moment, not from payment, so an unpaid Order holds one until it is cancelled or drops below the minimum ([ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md)); a paid redemption is not returned by a refund. See [ADR-0015](docs/adr/0015-campaign-usage-limit-and-vouchers.md).
_Avoid_: Quota, max uses.

**PaymentMethod**:
A configurable tender (cash, transfer, QRIS, etc.). Same list across all Stores. An Order carries a PaymentMethod **only when `payment_status = paid`** — a tender is *how money arrived*, so an unpaid Order has none. The POS hides the method picker while a Cart is unpaid and drops any chosen method when it toggles back to unpaid; a paid Order **requires** one. This is a corollary of binary payment — see [ADR-0001](docs/adr/0001-payment-is-binary.md).

### Activation

**Active** (`is_active`):
Whether a row may be used in day-to-day operation. Every table carrying the column starts in the state the business would pick by hand, and the two groups deliberately disagree:

- **Starts inactive** — Category, Service, Product, PaymentMethod, Store. A catalog row is drafted before it is sellable: someone fills in a price, a COGS, a code, and only then puts it on sale. A half-finished Service appearing on six tills the moment it is saved is the worse accident, so the column defaults to `false`.
- **Starts active** — User, Campaign. Both exist to work immediately: a new cashier logs in on their first shift, and a Campaign already carries its own date window and rules. Here `is_active` is the kill switch, not the go switch, so it defaults to `true`.

Those DB defaults are close to inert in practice — `isActiveSchema` is a **required** boolean on every create payload (Campaign's create schema defaults it to `true`), so the default only surfaces in hand-written SQL. The rule that matters is where inactive is enforced: **server-side, never only in the browser**. Checkout rejects an inactive Service or Product even though the POS also hides them; login and `adminMiddleware` reject an inactive User; Campaign eligibility rejects an inactive Campaign.
_Avoid_: enabled, published, visible.

### Operators

**Store**:
A physical shop location. Owns its own Orders and Shifts. **Does not** own its own Product stock — `products.stock` is global across stores in v1 (per-store stock deferred — D-12). 6 stores today, ceiling ~50.
_Avoid_: Branch, outlet.

**User**:
An operator. Role is one of **admin**, **cashier**, **worker**, **courier**. Scoped to one-or-many Stores via `userStores`. Role gates **money and admin operations** only; the OrderService processing axis (queue claim, status updates, detail photos) is open to any staff regardless of role — see [ADR-0004 amendment](docs/adr/0004-role-capabilities-v1.md).

**Shift**:
A User's working session at a Store, with `clock_in`/`clock_out`. Used for attendance reporting and revenue-by-shift breakdown in `reports`. Shifts are **attendance-only by design** (reaffirmed 2026-07-06): the business reviews clock-in data, but a Shift deliberately gates nothing operationally — Order creation, pickup, and payment never read shift state.

**Courier** (`role = courier`):
A User whose job is **collecting** dropped-off items from the customer at intake and **delivering** finished items back after pickup. Logs in solely to open a Shift (attendance); does **not** operate the POS, the queue, or money. Deliberately excluded from the worker-productivity report — that report is an allowlist on `role = worker`, so a Courier never appears. Excluding Couriers from that report is the reason the role exists. See [ADR-0010](docs/adr/0010-courier-role-login-only-excluded-by-allowlist.md).
_Avoid_: delivery guy, driver, rider (informal only).

### Order lifecycle

**Order**:
A single intake: a Customer drops items at a Store, work is done on the items, items are picked up. The unit of payment, refund, cancellation, and lifecycle.
_Avoid_: Transaction (legacy folder name — see Ambiguities), sale, ticket.

**Item**:
**One physical object dropped off for service** — a pair of shoes, a bag, a hat, a piece of luggage. A pair of shoes is one Item, not two. The unit a Customer hands over and collects back, and the thing a tag is stuck to. Owns the attributes captured at intake — **brand, color, model, size** — all deliberately **optional**: they describe the object for matching at handoff, not identity. Pickup identity is the Customer plus the pickup code (see **Pickup code**), so the POS never forces these fields. Also owns `item_code`, its physical tag.

An Item receives **1..N Services**, each a separate OrderService with its own status and its own handler. The everyday case is an upsell at the counter — a pair comes in for a deep clean and leaves the till as deep clean + repaint + leather care, one Item, three OrderServices, possibly three workers. Its **status is derived**, never authored: rolled up from its OrderServices exactly as Order status is. An Item is collectable only once **every** one of its OrderServices is `ready_for_pickup` — you cannot hand back half a shoe. See [ADR-0017](docs/adr/0017-item-groups-order-services.md).
_Avoid_: Pair (most Items are not one — a bag, a hat, and a suitcase are each a single Item), unit, article, piece.

**OrderService**:
**One Item receiving one Service.** An Order has 1..N; an Item has 1..N. Each owns its own status, a single **current** handler (`handler_id`), detail photos, its price, and an `is_priority` flag (defaults from `services.is_priority` on the catalog row, overridable per line at intake). The price is either **known or blank** — blank means "not yet determined" (a Repair awaiting inspection), which is distinct from **0, deliberately free** (a Rework line — [ADR-0013](docs/adr/0013-complaint-and-rework-line.md)). A blank price is set — and a set price may be corrected — while the Order is unpaid; every set-or-correct is logged with the acting user, and payment freezes prices. An Order with any non-cancelled unpriced line cannot be marked paid. See [ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md). The physical attributes and the tag code belong to the **Item**, not here — one Item getting three treatments is three OrderServices sharing one tag and one set of attributes. The handler can be reassigned by an admin (staff cannot poach a peer's item — self-assign throws if `handler_id` is already set to someone else); every reassignment is appended to `order_service_handler_logs` with `from_handler_id`, `to_handler_id`, `changed_by`, and an optional note.
_Avoid_: Order item, line item, job (informal worker shorthand only). **Not** the thing a Customer collects — that is the Item.

**OrderProduct**:
A Product line in an Order. Decrements the Product's global `stock` at create (no per-store stock in v1 — see Product). No status, no handler, no photos. Reversible whole-line, at most once, down exactly one off-ramp set by the Order's `payment_status`: **paid → refund** (marked by `refunded_at`, money-only, does **not** restore stock — goods left the shop) or **unpaid → cancel** (marked by `cancelled_at`, **restores stock** — goods never left). The two markers are mutually exclusive. See [ADR-0007](docs/adr/0007-product-refunds-whole-line-money-only.md) and [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md).

**OrderRefund** / **OrderRefundItem**:
A post-payment reversal recorded against an Order. Created only when `payment_status = paid`, by an admin, via the refund dialog. One OrderRefund per refund event; one OrderRefundItem per refunded line — **exactly one of** an OrderService or an OrderProduct — each carrying a `refundReasonEnum` value chosen by the admin (the reason vocabulary is shared across both line kinds). The admin picks **lines, never amounts**: each refunded line returns its full remaining refundable amount — the line's gross minus its prorated share of the Order discount, minus anything already refunded — settled in whole rupiah. Service lines may refund partially across multiple events; product lines refund **whole-line, at most once** — see [ADR-0007](docs/adr/0007-product-refunds-whole-line-money-only.md). Money movement is **out of band** — the POS records state only. The refund dialog offers both service and product lines ([architecture-deepening §8](docs/architecture-deepening.md)).

**OrderPickupEvent**:
A collection event. **Multiple events per Order are allowed** (partial pickup). **Payment precedes pickup** — the Order must be fully paid (`payment_status = paid`) before *any* pickup event may be created, partial or not. Enforced server-side; the pickup dialog will not record a collection on an unpaid Order. (Added 2026-06-15.)

**Pickup code**:
A 6-digit code on each Order. Generated by a PostgreSQL DB-side default (`random()`) at insert — **deliberately DB-side, not app-side**. Printed on the Receipt at drop-off (the claim ticket — see [ADR-0016](docs/adr/0016-receipt-is-claim-ticket.md)); also readable on the public `/track` page (visible only when `ready_for_pickup`) as the lost-receipt fallback. Customer gives it to the cashier; cashier enters it in the pickup dialog; server validates the code matches **this specific Order** before transitioning to `picked_up`. The code is a per-Order verification (the cashier already opened the Order), not a cross-Order discovery key — it is **deliberately not UNIQUE** in the schema. App-layer generation (CSPRNG) and UNIQUE-with-retry were both considered and declined; see [ADR-0005](docs/adr/0005-pickup-code-authentication.md) for the trade-off and the one outstanding CHECK-constraint fix.

**Receipt**:
The printed proof-of-order (thermal, Bahasa Indonesia — "struk") the cashier hands the Customer at drop-off, reprintable from the Order at any time. It is the physical claim ticket: it carries the Order code, the pickup code, and a QR link to `/track` (see [ADR-0016](docs/adr/0016-receipt-is-claim-ticket.md)). It also prints two shop terms, both **verbal policy, deliberately not system-enforced**: the **collection limit** and the pre-existing-damage term — items left uncollected beyond ~30 days are outside the shop's responsibility, and pre-existing damage is whatever was agreed at handover (the Drop-off photo is the evidence behind that second term). Nothing in the system tracks the 30 days: no abandonment status, no threshold on the Aging queue. Same posture as the Complaint's "complain by" window. The Receipt shows the **discounted** total whenever the Order was fully priced at drop-off, which is most Orders — the customer's proof matches what they will pay, even if they pay at pickup. It shows a **gross** total only while some line is still unpriced (a Repair awaiting inspection); the promo settles when that price lands, so staff say so out loud at drop-off and the customer gets a reprintable Receipt afterwards ([ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md)). It is a claim ticket first and a total second.
_Avoid_: invoice, nota, bill.

**Complaint**:
A Customer's post-pickup grievance about an `OrderService` — the Item was cleaned poorly, they are dissatisfied. A first-class, **write-once** record: `order_service_id` FK → the original (complained) line, free-text `reason`, `opened_by`, `created_at` — that is the whole row. **One Complaint per original line, lifetime** (`order_service_id` is UNIQUE): a Complaint is the whole grievance *episode*, not one round — "still bad after a Rework" is handled *inside* it (another Rework, or escalate to refund). A Complaint row is an **already-accepted** grievance — there is no "rejected" outcome and no open/closed status. Owns **0..N** Rework lines. Handling is an **escalation ladder** — re-clean first (a Rework); if still unsatisfactory, an admin refunds the original line (the money gate). The Complaint's **outcome is derived, never stored**: *reworked* if a Rework line points at it, *refunded* if the original line is `refunded`, else *pending*. Opening a Complaint and adding a Rework are open to **any staff** (the cashier takes the return); refunding is **admin-only** (the existing money gate, on the refund flow). Opening rejects a subject that is itself a Rework line; adding a Rework requires the original line still be `picked_up` (refund is terminal — no Rework after). `picked_up` stays terminal throughout — a Complaint never mutates the original line. **Complaint rate** (Complaints ÷ OrderService lines where `complaint_id IS NULL`, ~1–2%) is a tracked metric on its own Complaints menu/page (the Reports rate panel is a deferred follow-up). The goodwill voucher is **out of band and untracked in v1** — staff issue it manually (no customer-scoped Campaign, and the Complaint no longer records a `voucher_promised` flag). The ~2-day "complain by" window is verbal, **not** system-enforced. See [ADR-0013](docs/adr/0013-complaint-and-rework-line.md) (incl. the 2026-06-30 amendment that removed the status pipeline).
_Avoid_: ticket, case, dispute.

**Rework line**:
The re-clean of a complained Item, modelled as a **new free `OrderService` line on the same Order** (`price = 0`, `is_priority = true`), carrying a nullable `complaint_id` FK — a non-null `complaint_id` **is** the marker that a line is a Rework. Not a new Order and not a reopening of `picked_up`: the original line stays terminal, a *new* line is added. The Order is already `paid`, so a ₀ line needs no payment and no new pickup code — the Rework is collected against the **original Order's** code (same Order, same receipt). Flows through every existing seam unchanged (queue, the [ADR-0012](docs/adr/0012-photo-precedes-processing.md) photo gate, pickup-code validation). The Order legitimately leaves `completed` and returns as the Rework runs and is collected (`completed_at` shifts to the Rework's pickup; revenue books off `paid_at`, unchanged). **Excluded from the Complaint-rate denominator and the refund picker** — a free Rework must not inflate the grievance that created it, nor be refunded. Operator-facing label is "Rework" (button "Start rework", badge "REWORK"). See [ADR-0013](docs/adr/0013-complaint-and-rework-line.md).
_Avoid_: redo (the superseded draft term), rework **order** (it is a line on the existing Order, never a separate Order), re-clean ticket.

**Order status**:
A single `orderStatusEnum` column on `orders` (`created`, `processing`, `ready_for_pickup`, `completed`, `cancelled`) that is **derived**, not authored. The server recalculates it from the Order's OrderService statuses and OrderProduct line states after any state change via `deriveOrderStatus` in `order-status-machine.ts`:

- **No active OrderServices.** Roll up over **every** line — services *and* products. `cancelled` only if **every** line is cancelled (each service `cancelled` and each product `cancelled_at` set); `created` if there are no lines at all; otherwise `completed` (any `picked_up`, `refunded`, or live product line means real activity landed — a products-only Order with no cancellations is born completed). See [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md).
- **Some OrderServices terminal, others active.** If every non-terminal OrderService is `ready_for_pickup`, Order is `ready_for_pickup` — this is the partial-pickup mid-state (some items already collected, rest waiting at counter).
- **All OrderServices active.** If every active OrderService is `ready_for_pickup`, Order is `ready_for_pickup`. Else if any service has moved past `queued`, Order is `processing`. Else `created`.

Order status is never written directly by handlers; it is always recomputed from the truth-source (OrderService statuses + OrderProduct line states). Do not bypass the recalculation path. `completed` is therefore **not strictly terminal**: a Rework line (see **Rework line**) adds a fresh active OrderService to a delivered Order, so the rollup honestly flows `completed → processing → … → completed` again for the ~1–2% of Orders with a Complaint.

**Refund status** (`orders.refund_status`):
A second derived field on Order, separate from Order status. Computed from money, not service states, by `deriveOrderRefundStatus`: `none` when `refunded_amount = 0`, `full` when `refunded_amount >= paid_amount`, `partial` otherwise. Surfaces as the "Fully Refunded" / "Partially Refunded" badge on the order detail page. Since product lines became refundable ([ADR-0007](docs/adr/0007-product-refunds-whole-line-money-only.md)), every paid line can return its money and `full` is reachable for Orders containing products (previously they were stuck on `partial` forever — see [architecture-deepening §8](docs/architecture-deepening.md)). The badge stays a money fact; do not reinterpret it as a service-state rule.

**OrderService status**:
A single `orderServiceStatusEnum` column on `orders_services` that conflates two axes for v1:

- **Processing axis** — `queued → processing → quality_check → (qc_reject → processing | ready_for_pickup) → picked_up`. QC redo always loops through `qc_reject` (no direct `quality_check → processing` shortcut) so every redo is auditable in `order_service_status_logs`. `quality_check` is a **second-person inspection** in shop practice — a staff member other than the cleaner inspects the Item before it goes to the counter. This is deliberately **operational, not enforced** (decided 2026-07-06): the system does not block self-QC; who checked is reconstructable from the status logs. `queued → processing` requires ≥1 non-deleted service photo (proof-of-condition; the `qc_reject → processing` redo is exempt) — see [ADR-0012](docs/adr/0012-photo-precedes-processing.md). `picked_up` is the success terminal; the transition is gated by pickup-code validation in the pickup dialog and is never settable from a generic status dropdown.
- **Terminal-outcome axis** — `cancelled` and `refunded` are exit states gated by the Order's `payment_status` (unpaid → `cancelled`, paid → `refunded`). See [ADR-0004](docs/adr/0004-role-capabilities-v1.md). Reading these values loses the processing step the OrderService was in at the moment of exit; reconstruct from `order_service_status_logs` if needed.

Splitting the two axes into separate columns is a recorded follow-up tied to the Order Status Machine refactor; v1 ships with the conflated encoding.

**Services processed** (reports metric):
An OrderService counts as processed once it **first reaches `quality_check`** — reaching QC means the cleaning work happened. A later `qc_reject` loop does not un-count it, and each line counts once. Unified 2026-07-06: every report must use this definition; the narrower "reached `ready_for_pickup` only" reading (previously used by the worker-productivity panel, making its numbers disagree with the daily KPI) is wrong.
_Avoid_: **items processed** — the former name, retired when Item became a real concept. An Item receiving three treatments is **three** Services processed and **one** Item, so the old label counted the wrong noun. Also avoid items completed — completion is pickup, a different event. Both forbidden nouns are **still live in the code**: the daily KPI ships `items_processed` and the worker-productivity panel ships `items_completed`. The rename is glossary-only so far — use the new name in prose and in anything new; the code rename is a pending follow-up in `TODO.md`.

**Revenue** (reports metric):
What the shop kept: money collected on paid Orders, minus refunds. Always **net** — Campaign and Voucher discounts are already absorbed (they never reach the amount paid), and refunds are subtracted. A refund is **contra-revenue**, not a cost: it reduces the Revenue line itself rather than sitting below it. Refunds are deducted in the period they are **issued**, never by restating the period of the original sale — a June Order refunded in July reduces July.

Recognised at **payment**, not at pickup: the shop reports on a cash basis. Because payment precedes pickup ([ADR-0009](docs/adr/0009-payment-precedes-pickup.md)), money taken at drop-off books as Revenue before the Item is cleaned; v1 tracks no deferred-revenue liability for that gap. Switching to recognition-at-pickup would be a real change of basis, not a bug fix.

Only this number may be labelled "Revenue" — in a panel title, an API field, or a conversation.
_Avoid_: net revenue (redundant — Revenue is already net), turnover, and **total** (see Ambiguities).

**Gross sales**:
The list-price value of what was sold, before Campaign and Voucher discounts and before refunds. A management figure — it answers "what did we quote?", never "what did we earn". Wherever it appears it must be labelled Gross sales; it is **not** Revenue and must never be shortened to one.
_Avoid_: gross revenue, sales, total.

**Order Status Machine**:
One module owns every status write on `orders` and `orders_services`, plus the matching audit-log entry. Lives at `packages/server/src/modules/orders/order-status-machine.ts`. It holds:

- `deriveOrderStatus` — pure function. Children OrderService statuses + product count → Order rollup status.
- `transitionOrderService` — public seam for non-terminal status changes. Looks up the transition graph (`ORDER_SERVICE_TRANSITIONS`), rejects illegal moves, writes the row + status-log entry + recomputed Order rollup. Refuses `picked_up` and `refunded`; callers must use the sibling-only seams below. Refuses `cancelled` when Order is paid (per ADR-0004 disjoint off-ramps). Refuses `queued → processing` when the OrderService has zero non-deleted photos (per [ADR-0012](docs/adr/0012-photo-precedes-processing.md)).
- `completePickup` / `applyRefundTransition` — sibling-only seams for terminal transitions. The Pickup module calls `completePickup` **after** writing `order_pickup_events`; the Reversal module calls `applyRefundTransition` **after** writing `order_refunds` + `order_refund_items`.

All status writes go through this module. Do not write `orders_services.status` or `orders.status` directly from a handler.

_Avoid_: "order status service," "transition helper."

### Customer

**Customer**:
The person who placed the Order. `phone_number` is **UNIQUE** — duplicate phone on create returns the existing Customer.

**Customer lookup**:
The POS phone→name prefill. A dedicated `GET /admin/customers/lookup?phone=` returns the matching Customer (its columns; no store relation — the prefill needs only the name) or `null` — phone is identity, so the result is **0-or-1**, never a list. **UX-only**: it prefills the name and toggles the "Existing customer" badge; it does **not** resolve a `customer_id` for checkout. Checkout correctness stays with server find-or-create at Order submit — the payload is always `customer: { name, phone_number }`, never an id (see [ADR-0011](docs/adr/0011-pos-creates-customer-atomically-with-order.md)). Distinct from the admin customer **browse list** (`GET /admin/customers` — paginated, substring `ilike` on name/phone): same table, different intent. Do **not** route the POS lookup through the browse list — substring search is the wrong model for an identity probe.

### Photos

**Drop-off photo**:
One per Order, captured on the store iPad at intake. **Required at intake for every Order** — the POS blocks checkout until one is attached, **product-only Orders included** (product-only is a negligible share, so it is not special-cased). Captured before the Order exists and attached immediately after checkout commits; still replaceable later on the order detail page. Not a hard invariant: the post-checkout attach can fail, leaving the Order without one until someone retries — surfaced as "Missing" on the detail page, which is the designed recovery path. (Was "Non-blocking" pre-2026-06-15.) See [ADR-0014](docs/adr/0014-dropoff-photo-required-best-effort.md).

**Service detail photo**:
N per OrderService, no cap, capturable from intake onward on the worker phone (upload is **not** status-gated). Optional per-photo note. **At least one is required to start work**: an OrderService cannot transition `queued → processing` with zero non-deleted photos — proof-of-condition before the shop touches the Item. See [ADR-0012](docs/adr/0012-photo-precedes-processing.md).

**Pickup photo**:
Captured per OrderPickupEvent, **blocking** at the picked-up transition. Deliberately blocking (reaffirmed 2026-07-06): it is the proof-of-handover twin of the intake photos — dispute evidence that the items left with the customer.

All three types are soft-deleted (`deleted_at`). S3 objects are retained forever.

### Operator views (web-only)

**Cart**:
Ephemeral client-side construct in the Transactions POS. Holds in-progress OrderServices, OrderProducts, applied Campaigns, and — only when marked paid — a chosen PaymentMethod (see PaymentMethod). **Becomes an Order only when checkout succeeds.** Nothing persists server-side until then.

**Queue**:
The view of OrderServices needing work, scoped by Store, filtered by status. Used mainly by workers; any staff may self-assign `queued → processing` (processing axis is role-open — see [ADR-0004 amendment](docs/adr/0004-role-capabilities-v1.md)). Sort order is `is_priority DESC, Order.created_at ASC, OrderService.id ASC` — priority items bubble to the top; otherwise FIFO by intake time. `is_priority` carries no SLA or pricing effect; it is purely a queue-bumper.

**Aging queue**:
A Reports tab listing OrderServices not in a terminal status, ordered by `created_at` ascending.

**Transactions POS**:
The cashier UI at `/transactions` for creating Orders. (See Ambiguities — "Transaction" is the legacy folder name.)

## Relationships

- A **Customer** places an **Order** at one **Store**.
- An **Order** contains 1..N **Items** and 0..N **OrderProducts**. Its OrderServices are reached through its Items.
- An **Item** receives 1..N **Services** — one **OrderService** per pairing. Each OrderService has one **User** (worker) as current handler at any time. Admin may reassign; reassignments are logged in `order_service_handler_logs`.
- An **Item**'s status is **derived** from its OrderService statuses, never authored — the same rollup discipline Order status follows. An Item may be collected only when all of its OrderServices are `ready_for_pickup`.
- An **Order**'s status is **derived** from its **OrderService** statuses plus **OrderProduct** line states — never authored. See "Order status" for the rollup rule.
- An **Order** may have 0..N **OrderPickupEvents** — partial pickup permitted.
- A **Complaint** is opened against one original **OrderService** (FK) and owns **0..N Rework lines** — each Rework a new free OrderService on the *same* Order. Escalation to refund reverses the **original** paid line (`picked_up → refunded`); the ₀ Rework line is left untouched. See [ADR-0013](docs/adr/0013-complaint-and-rework-line.md).
- An **Order** may record the **Courier** who collected its items at intake (`orders.collected_by`, nullable FK → a `role = courier` User). A non-null value marks the Order as collected via delivery rather than walk-in; null = walk-in. There is no separate "is delivery" boolean — the Courier reference **is** the marker. Records **intake** only (collection), not return delivery. See [ADR-0010](docs/adr/0010-courier-role-login-only-excluded-by-allowlist.md).
- Cancel and refund are **disjoint, per-line off-ramps** gated by the Order's `payment_status`: unpaid → cancel only; paid → refund only. Both are **per-line** (staff/admin pick which OrderServices and OrderProducts to reverse) and both cover service **and** product lines; the only differences are the trigger (`payment_status`), the reason enum (`cancelReasonEnum` vs `refundReasonEnum`), money movement (none on cancel), and stock (cancel restores, refund does not). There is no auto-cascade between them. See [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md).
- A **Campaign** is scoped to 0..N **Stores** (zero = all Stores) and targets 1..N **Services**.
- A **Campaign** is either **listed** (optionally carrying a **usage limit**) or a **Voucher** (code mode) owning 1..N **Voucher codes** — never both; the two modes are mutually exclusive by construction. Each Voucher code redeems at most once. See [ADR-0015](docs/adr/0015-campaign-usage-limit-and-vouchers.md).
- An **Order** records every **Campaign** it redeemed; a Voucher redemption additionally names the specific **Voucher code** consumed. Redemption happens when the discount **settles** — once every line is priced ([ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md)) — so an unpaid Order can hold a slot or a code. It is released if the Order is fully cancelled, or if a cancellation or downward price correction drops it below the Campaign's minimum. A paid redemption is never released by a refund.
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

> **Dev:** "Customer comes back two days after pickup — the clean was bad. Do we reopen the order?"
> **Domain expert:** "No. `picked_up` is terminal. Open a Complaint against that OrderService and add a free Rework line to the same Order — same code, same receipt. If the re-clean still fails, an admin refunds the original line and we promise a voucher." (See [ADR-0013](docs/adr/0013-complaint-and-rework-line.md).)

> **Dev:** "Pair comes in for a deep clean, cashier upsells repaint and leather care. Is that three Orders? Three shoes?"
> **Domain expert:** "One Order, one Item, three OrderServices. Same pair, one tag, three statuses, maybe three different workers. The Item is ready when all three are."

> **Dev:** "Repair on a bag — do we make the cashier put a number in before checkout?"
> **Domain expert:** "No. Leave the price blank — the Order is created anyway: tag, drop-off photo, claim ticket. After inspection we agree the price with the customer on WhatsApp and someone types it in. Until every line has a price, the Order can't be paid. No price, no payment." (See [ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md).)

> **Dev:** "A VIP has a voucher code we gave them — do we pick their campaign at checkout?"
> **Domain expert:** "No. The cashier types the code; the server finds the Campaign. The code is bearer and single-use — it works once for whoever holds it, then it's dead. It isn't tied to that customer." (See [ADR-0015](docs/adr/0015-campaign-usage-limit-and-vouchers.md).)

## Flagged ambiguities

- **"Transaction"** — the web folder `apps/web/src/features/transactions/`, route `/transactions`, and Zustand store `transactions-store.ts` use the word as a legacy shorthand for *the create-Order flow*. **Resolution:** the canonical noun is **Order**. "Transactions POS" is acceptable as a UI surface name; do not use "transaction" to mean a row in `orders`, a refund, or any persisted object. New code should prefer **Order** wherever possible; rename folders/files in passing when work touches them — no dedicated rename PR planned.

- **"Branch" vs "Store"** — early product discussion used "branch"; schema, code, and UI now use **Store**. Use Store everywhere.

- **"Job" vs "OrderService"** — worker UI informally says "job" (e.g. "next job"). Canonical noun is **OrderService**. "Job" is colloquial shorthand only — never use in schemas, types, or docs.

- **"Total"** — used loosely across report panels and API fields for at least three different numbers: pre-discount line value, cash collected, and cash collected net of refunds. **Resolution:** "total" is not a reportable quantity. Say **Revenue** (net) or **Gross sales** (pre-discount), and name the field accordingly. "Order total" remains fine for a single Order's amount due, where there is no ambiguity.

- **Reports disagree with this glossary on Revenue (open, 2026-07-31)** — the daily/overview stack computes Revenue correctly (collected minus refunds, refunds bucketed by their own date). The seven range panels do **not**: they sum pre-discount service and product line values, so every Campaign and Voucher ever honoured is invisible there, and refunds are never subtracted. Those panels currently show **Gross sales** under a Revenue label. **Resolution:** the glossary is right and the range stack is wrong; it gets fixed as part of the report-query consolidation in `TODO.md`, which is deliberately on hold. Expect the range numbers to **drop** when it lands — that is discounts and refunds becoming visible, not a regression. Until then, do not quote range-panel figures as Revenue.

- **Item does not exist in the schema yet — closed 2026-08-26** — the schema has caught up with the glossary: `items` is a real table, `orders_services.item_id` points at it, and `brand`/`color`/`model`/`size`/`item_code` moved off the treatment row. **`item_code` now identifies a physical object**, not a treatment line — one pair sold three Services carries one tag, and anything still reading a code as a line reference is wrong. Pickup is taken per Item and refuses an object with a treatment still live on it, so half-collecting a pair is no longer expressible. Existing rows were backfilled one Item per OrderService, which is lossless but groups nothing retroactively — older Orders still show one object per treatment. See [ADR-0017](docs/adr/0017-item-groups-order-services.md).

- **"Pair" vs "Item"** — the glossary formerly called the unit of work "a pair of footwear", and the header called this a sneaker POS. The shop takes **footwear, bags, hats, and luggage**; most of those are not pairs. **Resolution:** the unit is an **Item** everywhere — in schemas, types, docs, and UI copy. "Pair" is acceptable only when the Item genuinely is one (a worked example about shoes). Corrected throughout 2026-08-08.

- **"Estimate"** — retired 2026-08-09. An earlier Repair-pricing design briefly made it a modelled concept: an intake price marked firm or provisional, with a confirmation step gating payment. Reversed before the implementation ever ran; it survives only as a rejected option in [ADR-0018](docs/adr/0018-price-is-known-or-blank-discounts-when-priced.md). **Resolution:** a line's price is either **known or blank**; there is no provisional number. Do not use "Estimate" in schemas, types, or docs; when a customer asks for "an estimate", the shop answers over WhatsApp after inspection, and what gets recorded is the agreed price.

- **Cancel granularity** — v1 shipped a **whole-Order** cancel (`cancelOrder` voided every cancellable OrderService at once) while the team's mental model was **per-line** cancel (the unpaid twin of refund). The two looked identical only because most Orders carry a single OrderService. **Resolution:** cancel is **per-line**, symmetric with refund — see the off-ramp relationship above and [ADR-0008](docs/adr/0008-cancel-is-unpaid-per-line-refund-twin.md). Do not describe cancel as an all-or-nothing Order-level action.
