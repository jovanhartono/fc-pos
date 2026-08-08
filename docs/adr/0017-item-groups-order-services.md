# Item groups OrderServices

`OrderService` was defined as *"one pair of footwear receiving one Service"*, so the physical object and the treatment applied to it were the same row: `brand`, `color`, `model`, `size` and `item_code` all live on `orders_services`. Reality disagrees. The shop's most common counter flow is an upsell — a pair arrives for a deep clean and leaves the till as deep clean + repaint + leather care — and each treatment genuinely needs its own status and its own handler. One object, several treatments. We decided to introduce **Item** as a first-class entity between `Order` and `OrderService`: the Order holds 1..N Items, each Item holds 1..N OrderServices, and the Item's status is **derived** from its children exactly as Order status already is.

The trigger was `item_code`. It is generated per service line (`${code}-S001`, `-S002`, …) and `UNIQUE`-indexed, which makes it the physical tag — but one object receiving three treatments gets three tag codes and three copies of its attributes, with nothing tying them together.

## Considered options

- **Item entity between Order and OrderService (chosen).** Attributes and the tag move up; status, handler, price, and photos stay on the OrderService.
- **Bundle / composite Service — one sold line that decomposes into internal steps.** Rejected: it models the wrong thing. The cashier sells the treatments *individually and upsells them one at a time*, so the customer sees three prices, not one. A bundle hides exactly the line-level pricing the counter depends on. It would also be the right answer for a shop selling a fixed "Full Restoration" package — we do not sell one.
- **Leave the model alone; group in the UI only.** Rejected: it fixes the queue's readability and nothing else. The duplicated attributes can still drift row-to-row, and the pickup rule below cannot be expressed at all.
- **Sequencing (`stage` on the Service catalog row, so only the current treatment is queue-visible).** Deferred, not rejected. The work is genuinely ordered — structural repair before cleaning before paint — but staff already sequence it by looking at the shelf, and physics prevents two workers holding one object. Grouping alone collapses the queue from three rows per object to one card, which is most of the value. Revisit if the grouped queue still misleads.

## Decisions

- **Item owns identity, OrderService owns work.** `brand`, `color`, `model`, `size`, `item_code` move to the Item. Status, `handler_id`, price, `is_priority`, and detail photos stay on the OrderService.
- **Item status is derived, never authored** — the same discipline as `deriveOrderStatus`. No second authoring path for status.
- **Order status keeps deriving directly from OrderServices.** Not from Item statuses. The rollup is equivalent and routing it through a new level would rewrite `order-status-machine.ts` for no behavioural gain — smallest blast radius.
- **An Item is collectable only when every one of its OrderServices is `ready_for_pickup`.** You cannot hand back half an object. Today nothing prevents recording pickup on one line while a sibling on the same object is still `processing`.
- **One tag per Item.** `item_code` moves off the service line; a physical object carries exactly one code.

## Consequences

- **The largest migration in the codebase so far.** Every query joining `orders → orders_services` gains a level, and existing rows must be backfilled into synthesised Items. Attribute-identical lines on one Order are *not* safely mergeable — two identical white Air Force 1s are two Items — so the backfill is one Item per existing OrderService, which is lossless but does not retroactively group anything.
- **`item_code` changes meaning.** It stops identifying a treatment line and starts identifying a physical object. Anything reading it as a line reference breaks.
- The per-OrderService photo gate ([ADR-0012](0012-photo-precedes-processing.md)) is unchanged and stays per-treatment: proof-of-condition before *each* treatment is the intended reading, not an accident.
- The reports metric formerly called "Items processed" was renamed **Services processed** — it counts OrderServices, and "Item" now means something else.
