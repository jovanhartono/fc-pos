# Deferred Actions (Post-v1)

Date: 2026-04-22
Status: Explicitly deferred — not in v1 scope
Source: Production-readiness audit (`./production-readiness-audit.md`)

Items skipped for first production launch. Each entry: **what**, **why deferred**, **trigger to revisit**, **rough effort**.

---

## Product / UX

### D-1. Printable item label with plastic tag
- **What:** Auto-generate printable label (barcode/QR + `item_code` + customer name + service) at order creation. Attach to plastic tag on each pair.
- **Current:** Handwritten tags.
- **Why deferred:** Thermal label printer hardware + print-format design + browser printing wiring not yet scoped.
- **Revisit when:** Order volume > 500/week per store OR tag-swap incidents reported.
- **Effort:** Medium. Client-side print dialog + `@react-pdf/renderer` or ZPL for Zebra-class label printers.

### D-2. Digital damage disclaimer in invoice
- **What:** Email/WhatsApp invoice embedding damage disclaimer signed at drop-off.
- **Current:** Paper disclaimer + drop-off photo.
- **Why deferred:** Depends on WhatsApp integration (D-3) and email service provider choice.
- **Revisit when:** WhatsApp integration lands.
- **Effort:** Low once D-3 is in.

### D-3. WhatsApp integration
- **What:** Outbound messages — order confirmation, ready-for-pickup notice, pickup code delivery, invoice PDF.
- **Current:** Pending. Customers use `/track` page manually.
- **Why deferred:** Provider selection (Twilio / Meta Cloud API / local BSP), templated message approval flow.
- **Revisit when:** Provider chosen + templates approved.
- **Effort:** Medium. New `notifications` module + template store + webhook handler.

### D-4. Thermal receipt printer
- **What:** Print receipt on cashier-side thermal printer after payment.
- **Current:** No print layer.
- **Why deferred:** Hardware purchase + ESC/POS driver wiring + receipt layout design.
- **Revisit when:** First store hardware delivered.
- **Effort:** Medium. Likely `react-to-print` + ESC/POS via WebUSB or local bridge app.

### D-5. Client-side photo compression
- **What:** Compress photos in-browser before presigned upload (target ~400KB each).
- **Current:** Raw upload — potential 90GB/mo at scale.
- **Why deferred:** Core photo flow works; cost kicks in only at scale.
- **Revisit when:** S3 bill > defined threshold OR first store hits >1K items/month.
- **Effort:** Low. `browser-image-compression` lib or canvas resize before S3 PUT.

### D-6. Customer-visible photos on `/track`
- **What:** Show drop-off / detail / pickup photos to customer via `/track`.
- **Current:** Track returns metadata only, no photo URLs.
- **Why deferred:** Privacy posture + WhatsApp link flow takes priority.
- **Revisit when:** Customer support requests photos frequently.
- **Effort:** Low. Return `buildMediaUrl()` on public track endpoint.

### D-7. Offline POS tolerance
- **What:** Queue orders locally when internet drops; sync on reconnect.
- **Current:** Hard-fail on network loss.
- **Why deferred:** Stores have reliable connectivity; complexity not justified for v1.
- **Revisit when:** Connectivity incidents cause lost orders.
- **Effort:** High. PWA + IndexedDB queue + conflict resolution.

---

## Pricing / Campaigns

### D-8. Per-service discount snapshot
- **What:** Snapshot `discount_allocated` per `order_services` row at create time. Replace runtime proportional split in refund cap.
- **Current:** `order-admin.service.ts:265-276` computes proportionally — correct only for order-level discounts.
- **Why deferred:** Today all discounts are order-level. Breaks only if per-service campaigns ship.
- **Revisit when:** Per-service campaign feature kicks off.
- **Effort:** Medium. Schema column + migration + service logic + refund cap refactor.

### D-9. Dynamic repair pricing
- **What:** Price quoted at intake based on item condition (not catalog).
- **Current:** Fixed catalog pricing.
- **Why deferred:** Business flagged as future feature.
- **Revisit when:** Repair service line grows > 10% of revenue.
- **Effort:** Medium. Price-override field on order_service + intake UI + audit log.

### D-10. Campaign stacking cap
- **What:** Limit number of campaigns combinable per order.
- **Current:** Unlimited stacking.
- **Why deferred:** No abuse reported; leave as-is.
- **Revisit when:** Discount leakage appears in reports.
- **Effort:** Low. Validation in order creation.

### D-11. Partial-amount refund within single service (loophole close)
- **What:** Server currently accepts multiple partial-amount refunds summing to service total. Business rule says whole-only.
- **Current:** API allows 60 + 40 on 100 IDR service.
- **Why deferred:** UI does not expose it; low exploit risk. Close when revisiting refund flow.
- **Revisit when:** Next refund-flow iteration OR audit finding.
- **Effort:** Low. Reject `amount !== refundableGross` in refund endpoint.

---

## Inventory

### D-12. Multi-branch stock + transfers
- **What:** Per-branch stock table + transfer log + low-stock alerts.
- **Current:** Global `products.stock`.
- **Why deferred:** v1 launches with manual reconciliation. Memory flags this as real future need.
- **Revisit when:** >2 stores carry physical products OR first reconciliation incident.
- **Effort:** High. Schema `products_branch_stock` + `stock_transfers` + UI + decrement logic rewrite.

### D-13. Low-stock alerts
- **What:** `reorder_level` per product + dashboard alert.
- **Current:** None.
- **Why deferred:** Follows D-12.
- **Revisit when:** D-12 lands.
- **Effort:** Low once D-12 is in.

---

## Operations

### D-14. Priority preemption UX
- **What:** Notify + "pause current item" button when priority order hits queue.
- **Current:** Priority sorts queue; worker finishes current item first. Accepted behavior.
- **Why deferred:** Business decision confirmed — waits until free worker.
- **Revisit when:** Priority SLA misses reported.
- **Effort:** Low-medium.

### D-15. Unclaimed items operational surfacing
- **What:** Passive UI listing >30-day items (no auto-status change).
- **Current:** Aging-items view (see core C-8) will cover oldest-in-queue but **not** post-pickup aging.
- **Why deferred:** Not urgent; 30-day rule is liability disclaimer only.
- **Revisit when:** Storage congestion or dispute volume.
- **Effort:** Low. Filter on `ready_for_pickup` age > 30 days.

---

## Infra / Ops

### D-16. Monitoring / error logging
- **What:** Sentry / equivalent + uptime check + DB slow-query alerting.
- **Current:** Server console logs only.
- **Why deferred:** User explicitly skipped for v1.
- **Revisit when:** First production incident OR post-launch + 4 weeks.
- **Effort:** Low. Sentry init + env var.

### D-17. Backup & DR beyond Neon branching
- **What:** Nightly off-site dump; documented restore runbook.
- **Current:** Neon branch snapshots only.
- **Why deferred:** User confirmed Neon sufficient.
- **Revisit when:** Compliance / customer-contract requirement.
- **Effort:** Medium.

### D-18. Secrets management + rotation
- **What:** Managed secrets (AWS Secrets Manager / Doppler / Vault). Rotation schedule.
- **Current:** Env vars, no rotation.
- **Why deferred:** User skip for v1.
- **Revisit when:** Compliance gate OR first leak scare.
- **Effort:** Low-medium.

---

## Audit / Data Quality

### D-19. Cancel reason → refund note linkage
- **What:** Preserve `order_services.cancel_reason` free-text on downstream refund record.
- **Current:** Refund reason enum disconnected from cancel text.
- **Why deferred:** Low-impact audit gap. Will bundle with next refund-flow work.
- **Revisit when:** First audit request mentions missing context.
- **Effort:** Low. Copy text into refund note on cancel-then-refund path.

---

## Index

| ID | Area | Effort | Trigger |
|----|------|--------|---------|
| D-1 | Printable label | M | Volume threshold |
| D-2 | Digital disclaimer | L | After D-3 |
| D-3 | WhatsApp integration | M | Provider picked |
| D-4 | Thermal printer | M | Hardware ready |
| D-5 | Photo compression | L | Cost threshold |
| D-6 | Photos on `/track` | L | Support requests |
| D-7 | Offline POS | H | Connectivity incidents |
| D-8 | Per-service discount snapshot | M | Per-service campaigns |
| D-9 | Dynamic repair pricing | M | Repair revenue growth |
| D-10 | Campaign stacking cap | L | Discount leakage |
| D-11 | Partial-refund loophole close | L | Refund flow iteration |
| D-12 | Multi-branch stock | H | >2 product stores |
| D-13 | Low-stock alerts | L | After D-12 |
| D-14 | Priority preemption UX | LM | SLA misses |
| D-15 | Unclaimed items UI | L | Storage congestion |
| D-16 | Monitoring | L | Post-launch |
| D-17 | DR backup | M | Compliance |
| D-18 | Secrets management | LM | Compliance |
| D-19 | Cancel→refund note link | L | Audit request |
