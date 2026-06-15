# Cancel is the unpaid, per-line twin of refund

Cancel and refund are the Order's two disjoint off-ramps (unpaid → cancel, paid → refund; [ADR-0004](0004-role-capabilities-v1.md)). v1 shipped them asymmetric: refund was per-line and covered both OrderServices and OrderProducts, while cancel was whole-Order and services-only — so a products-only unpaid Order could not be cancelled at all ([ADR-0007](0007-product-refunds-whole-line-money-only.md) flagged this as a known gap), and a mixed unpaid cancel silently left product stock decremented. We decided to make **cancel the exact unpaid mirror of refund**: per-line selection over services *and* products, gated by `payment_status = unpaid`, with no money movement — and, unlike refund, **cancel restores product stock**.

## Considered options

- **Make cancel per-line, symmetric with refund (chosen).** One off-ramp shape for paid and unpaid; staff who know the refund dialog know the cancel dialog.
- **Keep whole-Order cancel, just extend it to products.** Rejected — preserves the asymmetry the team's mental model never had; "cancel one item, keep the rest" stays impossible.
- **Block creation of products-only Orders.** Rejected — standalone retail product sales (no laundry service) are a real business case.

## Decisions

- **Per-line, whole-line, at most once.** The cancel endpoint takes an `items[]` payload mirroring `POSTOrderRefundSchema` (exactly one of `order_service_id` / `order_product_id` per item), each carrying a `cancelReasonEnum` value + optional note (note required when reason is `other`). The whole-Order `cancelOrder` / `/:id/cancel` shape is replaced.
- **Reason lives on the line, no `order_cancel_items` table.** Cancel has no money and is whole-line, so unlike refund it needs no separate items table. OrderService already has `status='cancelled'` + `cancel_reason` + `cancel_note`. OrderProduct gains `cancelled_at` + `cancel_reason` + `cancel_note`, mirroring those columns and the existing `refunded_at` marker.
- **Cancel restores stock; refund does not.** Refunding leaves stock alone because the goods physically left the shop and the reason doesn't say where they are ([ADR-0007](0007-product-refunds-whole-line-money-only.md)). An unpaid cancel is the opposite: the goods never left, so each cancelled product line does `stock += qty`. This is a deliberate **second writer** of `products.stock` (checkout was the only writer) — principled, because cancel reverses a checkout that never completed economically.
- **Status derivation generalizes to all lines.** `deriveOrderStatus` reads OrderProduct line states, not just a count. With no active OrderServices, the Order is `cancelled` iff **every** line (service and product) is cancelled; otherwise `completed` (any `picked_up`, `refunded`, or live product line is real activity). Status stays derived, never authored.
- **Integrity.** A product line is cancelled **XOR** refunded — DB CHECK `cancelled_at IS NULL OR refunded_at IS NULL`. Note-required-when-`other` mirrors the CHECK on `order_refund_items`.
- **Authorization unchanged.** Cancel stays open to any staff on unpaid Orders ([ADR-0004](0004-role-capabilities-v1.md) amendment); refund stays admin-only.

## Consequences

- `products.stock` now has two writers (checkout decrements, cancel restores). Any future stock reasoning must account for both. Refund still never touches stock — the asymmetry is intentional and is the most surprising part of this decision.
- The schema change (new `order_products` columns + CHECK) ships via `push:dev`; the CHECK + the existing product-refund guards must reach prod via `push:prod` before the next deploy.
- ADR-0007's "no stock mutation" stance is now scoped to **refund**; its "products-only unpaid Orders cannot be cancelled" consequence is resolved here.
