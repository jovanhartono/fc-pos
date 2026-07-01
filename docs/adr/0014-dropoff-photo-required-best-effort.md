# Drop-off photo required at intake, attached best-effort

Every Order carries one **drop-off photo** — proof of what was handed across the counter at intake ([CONTEXT.md](../../CONTEXT.md) — Drop-off photo). The POS **requires** it: checkout is blocked until the cashier attaches one. But it is **not a hard invariant** — the photo is captured before the Order exists and uploaded (via S3 presign) in a *separate* request *after* checkout commits, and that attach is allowed to fail without failing the Order. So an Order can exist with `dropoff_photo_path = null`. This ADR records that the requirement is a client-side intake gate plus a best-effort attach with a recovery path — not a server-enforced constraint — and that it applies to every Order regardless of contents. (Policy was "Non-blocking" pre-2026-06-15.)

## Considered options

- **Intake gate + best-effort attach + detail-page recovery (chosen).** The POS blocks checkout without a selected photo; the Order is created first, the photo is `PUT` afterward, and a failed `PUT` surfaces as "Missing" on the order detail page for retry. Creating a paying customer's Order is never held hostage to an S3/network hiccup.
- **Atomic create (Order + photo in one request/transaction).** Rejected: the photo is a large binary uploaded to S3 by presigned URL before the Order id exists; folding it into order creation makes the single most common counter action fragile — a flaky upload would block the sale. The proof isn't worth failing revenue capture.
- **Hard server invariant (`NOT NULL` + reject creation without a photo).** Rejected: same fragility as atomic, plus it would require backfilling existing null rows and offers no way to recover a genuinely-failed attach.

## Decisions

- **Required for every Order, product-only included.** The POS gate keys on total cart count (`count > 0 && !!dropoffPhoto`), so a product-only sale still needs a photo. Not special-cased: product-only is ~0.3–0.5% of transactions, and branching the rule for a negligible slice costs more than it saves.
- **Client-enforced, not server-enforced.** `dropoff_photo_path` is nullable; order creation never sets it; the photo is saved via `PUT /admin/orders/:id/dropoff-photo`. The client gate guarantees only that a photo was *selected*, not that it persisted.
- **Order detail is the recovery path.** A photoless Order shows "Missing" with an upload control in the attachments section of the detail page. This handling is load-bearing — do not remove it on the assumption that every Order has a photo.

## Consequences

- **Consumers must treat `dropoff_photo_path` as nullable.** Failed or never-retried attaches leave photoless Orders indefinitely; rendering must handle null (order detail does).
- **Seed mirrors reality.** ~10% of seeded Orders are photoless (`run-seed.ts`) to keep the recovery UI exercised; the old seed wrongly tied photos to service-bearing Orders only.
- **Distinct from the per-pair service photo gate.** The `queued → processing` service-photo rule ([ADR-0012](0012-photo-precedes-processing.md)) *is* hard server-enforced; the drop-off photo is deliberately softer (intake gate + best-effort). Two photo rules, two enforcement strengths — don't conflate them.
