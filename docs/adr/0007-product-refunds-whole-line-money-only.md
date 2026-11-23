# Product refunds: whole-line, money-only, no restock

`orders.refund_status` is derived from money (`refunded_amount` vs `paid_amount`), but the v1 refund flow covered services only — so any paid Order containing Products was stuck on `partial` forever after all OrderServices were refunded. We fixed the money axis by making OrderProducts refundable, with three deliberate constraints:

1. **Whole-line only.** A product line (`orders_products` row, price × qty) is refunded in full or not at all — the server computes the amount from the line's cap (subtotal minus proportionally-allocated Order discount minus prior refunds) and ignores any client-sent amount, exactly as it already does for services. No per-qty partial refunds.
2. **Single refund-items table.** `order_refund_items` gained a nullable `order_product_id` alongside a now-nullable `order_service_id`, with an XOR CHECK (exactly one set) and a partial UNIQUE on `order_product_id` — whole-line means each product line refunds at most once, and the DB enforces it. A separate `order_refund_products` table was rejected: every "all refunded lines" read would become a UNION, and the `reason`/`note` columns plus the other-requires-note CHECK would be duplicated. (Services deliberately have no such UNIQUE — D-11 keeps partial-amount service refunds server-allowed.)
3. **No stock mutation.** Refunding a product does not increment `products.stock`. Stock answers "how many can we still sell"; a refund only records "money went back". The refund reason doesn't tell you where the item physically is (`damaged` → trash, `customer_cancelled` → maybe the shelf), so auto-restock would be wrong about half the time. This matches the existing stance that money movement is out of band, and the existing precedent that `cancelOrder` never touches stock. Stock has exactly one writer: checkout. Genuine sellable returns are a manual stock edit.

`refundReasonEnum` is reused unchanged for products; `cannot_process`/`lost` are simply never picked. Refunded product lines are marked with `orders_products.refunded_at` (timestamp, not enum — whole-line makes the state binary). The Order Status Machine is not involved: products have no status axis, no transition graph, and no effect on the Order rollup, so the reversal module writes `refunded_at` inline in the refund transaction.

## Consequences

- Per-qty refunds stay reachable later: add a `qty` column to `order_refund_items` and swap `refunded_at` for a refunded-qty counter. Existing whole-line rows remain interpretable.
- Products-only **unpaid** Orders still cannot be cancelled (`cancelOrder` requires at least one cancellable OrderService) — known adjacent gap, deliberately out of scope here. **Resolved by [ADR-0008](0008-cancel-is-unpaid-per-line-refund-twin.md):** cancel became per-line over services + products, and the "no stock mutation" stance (point 3 above) is now scoped to refund only — cancel restores stock.

## Amendment 2026-11-03 — a Buy N Get M discount stays on the Services that earned it

A line's share of the Order discount used to be its share of the gross, whatever earned the discount. On prod Order 1482 (5 DCS, 6 Hard Stain, Pay 4 Get 1 on DCS), refunding a Hard Stain returned 35.556 instead of 40.000: it took back part of a free DCS the Hard Stain never earned.

Now each Buy N Get M Campaign's `applied_amount` is shared, by price, only over the lines that count for it: an eligible Service, not cancelled, priced, not a Rework (the `isBogoSlot` rule). What is left of the Order discount (manual, fixed, %) then spreads over every line by what the line has left after the free share, the way checkout takes a % off what remains after the free Service. `orderLineRefundCaps` in `schema/refund-allocation.ts` works this out for the server and the Refund dialog alike.

- Only the lines that fill a whole group earned the free ones. Taking the cheapest first, as checkout does, `floor(count ÷ (buy + free))` groups are filled, and an eligible line left over carries none of the free amount. On prod Order 390 the 10 DCS make both Pay 4 Get 1 groups, so the 11th line, a DCSS at 150.000, refunds 146.739 rather than 123.222. Same-priced lines at the cut share it evenly: 6 DCS with one group of 5 carry 10.000 each, since no single DCS is the leftover.
- When a cancellation before payment leaves fewer eligible lines than one group, the free amount stays on the eligible lines that are left. The Campaign isn't taken back, even though the Order no longer earns it.
- No line carries more than its price, and a cancelled line carries nothing, so the caps never add up to more than the Customer paid. Anything a line can't hold moves to the rest of the Order.
- A refunded line keeps its share, so one refund doesn't move another line's cap.
- Eligible Services and list prices are read as they stand at refund time, not as they were at settlement. An admin who edits a Campaign's eligible Services between two refunds on one Order moves the second refund's cap. Storing the eligible Services on `order_campaigns` would pin it; not done, since Campaigns rarely change mid-Order.
