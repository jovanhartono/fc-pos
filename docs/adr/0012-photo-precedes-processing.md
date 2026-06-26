# Photo precedes processing

Service detail photos shipped as **optional**, captured *during* processing on the worker phone ([CONTEXT.md](../../CONTEXT.md) — Photos). The business now wants at least one photo of a pair **before** work starts on it: proof-of-condition before the shop touches the shoes (dispute/liability evidence). We decided that an `OrderService` cannot leave `queued → processing` while it has **zero non-deleted** service photos.

This is the per-pair twin of the order-level drop-off gate: the drop-off photo proves what arrived at intake; the per-pair photo proves each pair's condition before cleaning begins.

## Considered options

- **Hard gate, server-enforced (chosen).** The `queued → processing` transition refuses when the OrderService has zero non-deleted `order_services_images`. Enforced in the status-machine seam, mirrored in the UI.
- **UI-only nudge on the order detail screen.** Rejected: the queue's "Hold to Start Work" does the identical `queued → processing`, and the raw status endpoint is callable directly — both would bypass a button-level check. A real rule belongs at the single write seam, not on one button.
- **New "before-work" photo kind, separate from detail photos.** Rejected: `order_services_images` has no kind discriminator today and nobody asked to split before/after. Any non-deleted service photo counts for v1; revisit if the business later wants a typed split.

## Decisions

- **Enforced server-side in `transitionOrderService`** (`order-status-machine.ts`) — the single chokepoint both `updateOrderServiceStatus` (order detail) and `startOrderServiceWork` (queue) funnel through. The check fires only when `from === "queued" && to === "processing"`; zero non-deleted images → `BadRequestException`. The count runs on the same executor (transaction) as the transition.
- **Scope: `queued → processing` only.** `qc_reject → processing` (the QC redo loop) is exempt — by then the pair was already processed once and photos exist; re-gating a redo is friction without liability gain.
- **No override.** Uniform for every role including admin. The processing axis is role-open (any staff start work); the photo gate is role-blind. A gate admins can wave through is not a gate.
- **Web mirror.** Order detail disables the "Process" button and the queue disables "Hold to Start Work" when `status === "queued" && images.length === 0`, with the hint "Add an item photo before starting work." The photo-add control sits in the same panel on both surfaces. The server stays the source of truth; the UI only explains the gate early.
- **Count is soft-delete aware** — only `order_services_images` rows with `deleted_at IS NULL` count, matching the client's `service.images`.

## Consequences

- A photo is **capturable while still queued** — `saveOrderServicePhoto` does not gate on status — so the rule is no chicken-and-egg deadlock: photograph the pair, then start.
- An Order now has **two** photo gates with distinct purposes: the order-level drop-off photo at intake ([CONTEXT.md](../../CONTEXT.md) — Drop-off photo) and the per-pair service photo at work start.
- **No schema change.** Existing `queued` items with zero photos become un-startable until one is added; nothing migrates.
