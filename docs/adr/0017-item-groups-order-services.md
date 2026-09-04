# Item groups OrderServices

> **Amended 2026-09-05:** photos now belong to the Item, not the OrderService — see [ADR-0019](0019-photos-belong-to-the-item.md).
>
> **Amended 2026-08-28:** an Item refunded before it was ever collected is now collectable, and reads as `refunded` rather than `picked_up` — see [Amendment](#amendment-2026-08-28--a-refunded-pair-still-goes-home).

`OrderService` was defined as *"one pair of footwear receiving one Service"*, so the physical object and the treatment applied to it were the same row: `brand`, `color`, `model`, `size` and `item_code` all live on `orders_services`. Reality disagrees. The shop's most common counter flow is an upsell — a pair arrives for a deep clean and leaves the till as deep clean + repaint + leather care — and each treatment genuinely needs its own status and its own handler. One object, several treatments. We decided to introduce **Item** as a first-class entity between `Order` and `OrderService`: the Order holds 1..N Items, each Item holds 1..N OrderServices, and the Item's status is **derived** from its children exactly as Order status already is.

The trigger was `item_code`. It is generated per service line (`${code}-S001`, `-S002`, …) and `UNIQUE`-indexed, which makes it the physical tag — but one object receiving three treatments gets three tag codes and three copies of its attributes, with nothing tying them together.

## Considered options

- **Item entity between Order and OrderService (chosen).** Attributes and the tag move up; status, handler, price, and photos stay on the OrderService.
- **Bundle / composite Service — one sold line that decomposes into internal steps.** Rejected: it models the wrong thing. The cashier sells the treatments *individually and upsells them one at a time*, so the customer sees three prices, not one. A bundle hides exactly the line-level pricing the counter depends on. It would also be the right answer for a shop selling a fixed "Full Restoration" package — we do not sell one.
- **Leave the model alone; group in the UI only.** Rejected: it fixes the queue's readability and nothing else. The duplicated attributes can still drift row-to-row, and the pickup rule below cannot be expressed at all.
- **Sequencing (`stage` on the Service catalog row, so only the current treatment is queue-visible).** Deferred, not rejected. The work is genuinely ordered — structural repair before cleaning before paint — but staff already sequence it by looking at the shelf, and physics prevents two workers holding one object. Grouping alone collapses the queue from three rows per object to one card, which is most of the value. Revisit if the grouped queue still misleads.

## Decisions

- **Item owns identity, OrderService owns work.** `brand`, `color`, `model`, `size`, `item_code` move to the Item. Status, `handler_id`, price, `is_priority`, and detail photos stay on the OrderService. *(Detail photos moved to the Item on 2026-09-05 — [ADR-0019](0019-photos-belong-to-the-item.md).)*
- **Item status is derived, never authored** — the same discipline as `deriveOrderStatus`. No second authoring path for status.
- **Order status keeps deriving directly from OrderServices.** Not from Item statuses. The rollup is equivalent and routing it through a new level would rewrite `order-status-machine.ts` for no behavioural gain — smallest blast radius.
- **An Item is collectable only when every one of its OrderServices is `ready_for_pickup`.** You cannot hand back half an object. Today nothing prevents recording pickup on one line while a sibling on the same object is still `processing`. *(Amended 2026-08-28 — a fully refunded Item is collectable too; see below.)*
- **One tag per Item.** `item_code` moves off the service line; a physical object carries exactly one code.

## Consequences

- **The largest migration in the codebase so far.** Every query joining `orders → orders_services` gains a level, and existing rows must be backfilled into synthesised Items. Attribute-identical lines on one Order are *not* safely mergeable — two identical white Air Force 1s are two Items — so the backfill is one Item per existing OrderService, which is lossless but does not retroactively group anything.
- **`item_code` changes meaning.** It stops identifying a treatment line and starts identifying a physical object. Anything reading it as a line reference breaks.
- The per-OrderService photo gate ([ADR-0012](0012-photo-precedes-processing.md)) is unchanged and stays per-treatment: proof-of-condition before *each* treatment is the intended reading, not an accident. *(Reversed 2026-09-05 — the photo turned out to be a record of the object, not the treatment; photos and the gate now live on the Item. See [ADR-0019](0019-photos-belong-to-the-item.md).)*
- The reports metric formerly called "Items processed" was renamed **Services processed** — it counts OrderServices, and "Item" now means something else.

## Amendment 2026-08-28 — a refunded pair still goes home

Two decisions above combined into a wrong answer. Item status was taken to be the Order rollup with its endings renamed, so the Order's `completed` became the Item's `picked_up`; and refund is reachable from every non-terminal status ([ADR-0004](0004-role-capabilities-v1.md)). So a pair dropped off, refunded at the counter, and still sitting on the rack had no live treatment left, rolled up as `completed`, and read back as `picked_up`.

`completed` is the right word for the Order — money settled, nothing called off. It is the wrong word for an Item, because an Item status is a claim about **where the physical object is**, and this one never moved. The customer saw **PICKED UP** on `/track` for shoes still in our shop, and the pickup desk refused to hand them over, because a refunded row has no live treatment that could ever turn ready.

**New rules:**

- **Item status gains `refunded`** — terminal, nothing was ever collected. `picked_up` now means the object went out the door, and `orders_services.pickup_event_id` is what says so. The column already carries exactly that meaning under two CHECKs: it is NULL unless the row is `picked_up` or `refunded`, and never NULL on `picked_up`. A pair refunded *after* it was collected keeps its pickup event and keeps reading `picked_up`.
- **A fully refunded, never-collected Item is collectable.** The refund settled the money, not the object; the pair is still the customer's to take home.
- **The handover is recorded on every row that leaves with the object; only a status change earns a status-log entry.** The finished treatments flip to `picked_up`. A treatment refunded before anyone came for the pair has no status left to move, so it records the handover and nothing else — the pickup event is what says when that pair went back and who returned it. A `cancelled` sibling records neither: the shop never did that work, and the schema refuses it a pickup event.

- **The two rollups share how far the work got, not what the ending is called.** "Renaming the Order rollup" was the wrong seam — it had to be corrected afterwards from the very rows it was given, because the rename collapsed two endings into one. What an Order and an Item genuinely share is reading the live treatments: nothing started, in progress, all ready, or nothing live left — including the subtle rule that a cancelled line is no evidence anyone started. That classification lives in one place; each aggregate then names its own endings. This is still not "Order status derived from Item statuses", which stays rejected above.

Order status is unchanged: it still rolls up over treatment rows directly, and still calls both endings `completed`, which for an Order is correct — money settled, nothing called off ([ADR-0008](0008-cancel-is-unpaid-per-line-refund-twin.md)).
