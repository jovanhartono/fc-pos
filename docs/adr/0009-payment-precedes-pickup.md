# Payment precedes pickup

Payment is binary and whole-Order ([ADR-0001](0001-payment-is-binary.md)); pickup is per-event and may be partial — an Order can be collected across multiple `OrderPickupEvent`s ([ADR-0003](0003-business-rules-locked-2026-04-28.md)). v1 shipped pickup with **no payment gate**: `createOrderPickupEvent` checked only permission, the pickup code, and service readiness, so an unpaid Order could be fully collected. We decided that **an Order must be fully paid before *any* pickup event** — first or partial.

## Considered options

- **Strict — paid before any pickup (chosen).** No collection of any kind while `payment_status = unpaid`. For the common single-OrderService Order this is the only sensible reading anyway.
- **Completion-gated — partial pickups allowed unpaid, payment required only for the pickup that completes the Order.** Rejected: it lets a customer walk off with most pairs (e.g. 4 of 5) unpaid and only forces payment to collect the last one — goods leave the shop against unpaid money. The convenience is marginal (it only differs from strict on multi-line Orders) and the risk is real.
- **No gate — keep pay-at/after-pickup possible.** Rejected: the business rule is "customer pays first." There is no trusted/pay-later flow in v1.

## Decisions

- **Enforced server-side, not just in the UI.** The gate lives in `createOrderPickupEvent` (and fails fast in `createOrderPickupEventPresign`, so a cashier never uploads a pickup photo the save will reject). The check is `payment_status === "paid"` or `BadRequestException("Order must be paid before pickup")`. The web gate is a mirror, not the source of truth.
- **Web mirror.** `order-action-gates.ts` folds `isPaid` into `canOpenPickup`, so the "Pick up" button is disabled on unpaid Orders. The order detail page surfaces the reason — "Order must be paid before pickup", or "A cashier must collect payment before pickup" for a pickup-only worker.
- **Payment stays a separate step, not embedded in the pickup dialog.** Paying is done via the existing `OrderPaymentCard` on the order detail page (`updateOrderPayment`); its mutation invalidates the detail, so the pickup button re-enables on refetch. Embedding payment into the pickup dialog was rejected — payment (`admin`/`cashier`) and pickup (`admin`/`cashier`/`can_process_pickup`) have different role gates, so coupling them into one dialog would fork on role for marginal tap savings.

## Consequences

- A **pickup-only worker** (`can_process_pickup`, not cashier) cannot clear an unpaid Order: they can neither pay (`OrderPaymentCard` isn't rendered for them) nor pick up. This is the intended outcome — they must fetch a cashier. The UI states this rather than showing a silent dead button.
- The rule reads `payment_status` inside the pickup path, which is why a future reader sees a money field gating a collection action — this ADR is that "why".
- No schema change. The gate is pure service logic; existing unpaid Orders simply become un-pickable until paid.
