# Photos belong to the Item

[ADR-0012](0012-photo-precedes-processing.md) gated `queued → processing` on a photo per `OrderService`, and [ADR-0017](0017-item-groups-order-services.md) moved identity onto the Item but deliberately left photos on the treatment row — "proof-of-condition before *each* treatment is the intended reading." Shop practice disagrees. The photo is a **before-service record of the object**, taken at drop-off, mainly by the cashier; a worker adds one only on finding a condition worth recording, and nobody photographs a treatment as such. One Item receiving three Services was therefore carrying three disjoint galleries and clearing three separate start-work gates with what was in practice one shot. We decided that photos belong to the **Item**: the gate reads the Item's photos, a Rework counts only photos newer than its Complaint, and after-treatment photos are out of scope.

## Considered options

- **Item-owned photos, gate per Item (chosen).** One gallery per object; every treatment on it reads the same photos and the same gate.
- **Keep photos per OrderService, fan the cashier's shot out to every line.** Rejected: the same file referenced N times, a soft-delete that has to cascade to its copies, and a gate that still bites each line. It models a treatment as the thing photographed, which it is not.
- **Item-owned photos, but keep the gate satisfiable per treatment through a link table.** Rejected: it reintroduces exactly the per-treatment link the move removes, for a rule nobody wants. The upsell case — clean + repaint + leather care sold at the counter together — has one object in one condition; a second photo of it proves nothing.
- **Rework gate: "a photo newer than the line", for every line.** Narrowed. Treatment rows have no `created_at`, and only two paths insert them — intake (together with the Item) and Rework. So "newer than the line" and "is a Rework" name the same set. The Rework rule compares against its Complaint's `created_at` instead: that is the moment the object came back over the counter, which is what the photo has to be newer than. No new column.
- **Rework gate: none — the first-visit photos unlock the Rework.** Rejected: [ADR-0013](0013-complaint-and-rework-line.md) relies on the gate to force a photo of the *returned* pair before re-cleaning. The dispute the complaint flow exists for is precisely about the object's condition on return.

## Decisions

- **`order_services_images` becomes `item_images`.** `item_id NOT NULL` referencing `items`, backfilled from the line's `item_id`; `order_service_id` is dropped. `note`, `uploaded_by`, soft-delete pair, and the uploader-or-admin delete rule are unchanged. *(2026-09-05: #104 briefly made the sweep remove the file behind a soft-deleted row; reverted the same day. The file stays: a deleted photo is hidden, not destroyed.)*
- **Routes and storage keys are per Item.** `/admin/orders/:id/items/:itemId/photos` (presign, save, delete). New objects are keyed `orders/{orderId}/items/{itemId}/{uuid}`. Existing objects stay under their `services/{serviceId}/` keys and are not moved: the photo sweep protects whatever path the database holds and never reads a key's layout.
- **The gate in `transitionOrderService`** fires on `from === "queued" && to === "processing"` as before, but counts non-deleted rows on the line's **Item**. When the line carries a `complaint_id`, only rows with `created_at` later than that Complaint's `created_at` count. Still role-blind, still no override, `qc_reject → processing` still exempt.
- **After-treatment photos are a non-goal.** The shop shoots those on separate devices for marketing. `item_images` has no kind discriminator and gets none; every row is a before-service record.
- **The Drop-off photo ([ADR-0014](0014-dropoff-photo-required-best-effort.md)) is unchanged.** Still one per Order, still the POS intake gate. The two answer different questions and do not overlap: the Drop-off photo is **proof of the handover** — who dropped what off across the counter — while the Item photo is **proof of the object's condition**. Both are taken by the cashier at drop-off, which is why they were briefly suspected of overlapping (settled 2026-09-05).

## Consequences

- **Amends two ADRs.** ADR-0012's gate now reads the Item; ADR-0017's "stays per-treatment" consequence is reversed. Both carry a pointer here.
- **Upsell lines start on one photo.** A second worker taking the repaint on a pair already photographed for its deep clean needs no photo of their own.
- **A Rework needs a fresh photo.** The worker photographs the returned pair before starting; the first-visit gallery no longer unlocks it. The web mirror's hint needs a Rework-aware variant.
- **Worker and order-detail screens show the Item's gallery on every treatment.** Two treatments on one object stop showing two disjoint galleries. *(2026-09-05: the order detail page moved the gallery and the upload button onto the Item block itself; its treatment sheet no longer repeats them. The worker queue sheet is unchanged.)*
- **The POS captures no per-Item photo at checkout today.** Cashiers take Item photos from the order detail page after checkout, exactly where they took service photos before. Capturing them inside intake is a follow-up, not part of this decision.
- **Seed changes shape.** One photo per Item rather than one per treatment line, so every seeded Item clears the gate.
- **Migration precondition.** `order_service_id` is nullable on the old table. Check both environments for orphan rows before the `NOT NULL` backfill; an orphan cannot be re-parented and has to be dropped by hand.
