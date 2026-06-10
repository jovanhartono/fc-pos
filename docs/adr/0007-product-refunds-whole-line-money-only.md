# Product refunds: whole-line, money-only, no restock

`orders.refund_status` is derived from money (`refunded_amount` vs `paid_amount`), but the v1 refund flow covered services only — so any paid Order containing Products was stuck on `partial` forever after all OrderServices were refunded (architecture-deepening §8). We fixed the money axis by making OrderProducts refundable, with three deliberate constraints:

1. **Whole-line only.** A product line (`orders_products` row, price × qty) is refunded in full or not at all — the server computes the amount from the line's cap (subtotal minus proportionally-allocated Order discount minus prior refunds) and ignores any client-sent amount, exactly as it already does for services. No per-qty partial refunds.
2. **Single refund-items table.** `order_refund_items` gained a nullable `order_product_id` alongside a now-nullable `order_service_id`, with an XOR CHECK (exactly one set) and a partial UNIQUE on `order_product_id` — whole-line means each product line refunds at most once, and the DB enforces it. A separate `order_refund_products` table was rejected: every "all refunded lines" read would become a UNION, and the `reason`/`note` columns plus the other-requires-note CHECK would be duplicated. (Services deliberately have no such UNIQUE — D-11 keeps partial-amount service refunds server-allowed.)
3. **No stock mutation.** Refunding a product does not increment `products.stock`. Stock answers "how many can we still sell"; a refund only records "money went back". The refund reason doesn't tell you where the item physically is (`damaged` → trash, `customer_cancelled` → maybe the shelf), so auto-restock would be wrong about half the time. This matches the existing stance that money movement is out of band, and the existing precedent that `cancelOrder` never touches stock. Stock has exactly one writer: checkout. Genuine sellable returns are a manual stock edit.

`refundReasonEnum` is reused unchanged for products; `cannot_process`/`lost` are simply never picked. Refunded product lines are marked with `orders_products.refunded_at` (timestamp, not enum — whole-line makes the state binary). The Order Status Machine is not involved: products have no status axis, no transition graph, and no effect on the Order rollup, so the reversal module writes `refunded_at` inline in the refund transaction.

## Consequences

- Per-qty refunds stay reachable later: add a `qty` column to `order_refund_items` and swap `refunded_at` for a refunded-qty counter. Existing whole-line rows remain interpretable.
- Products-only **unpaid** Orders still cannot be cancelled (`cancelOrder` requires at least one cancellable OrderService) — known adjacent gap, deliberately out of scope here.
