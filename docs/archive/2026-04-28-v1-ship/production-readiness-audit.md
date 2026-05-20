# Fresclean Production-Readiness Audit

Date: 2026-04-22
Status: Pre-production review
Scope: Order lifecycle, photos, payments, refunds, stock, roles, timezone, devices

Scanned against business-context memory. Code paths verified. Findings in three buckets: **real bugs**, **ambiguities needing product call**, **context gaps to clear before ship**.

---

## 1. Real logic flaws (code confirmed)

### 1.1 Timezone bleed on order codes + date filters — HIGH
`packages/server/src/modules/orders/order.service.ts:328`

```ts
const dateStr = dayjs().format("DDMMYYYY");
```

No `.tz("Asia/Jakarta")`. Bun container typically runs UTC → between 17:00–23:59 Jakarta, order codes get tomorrow's date.

Same pattern in:
- `order-admin.service.ts:440, 449` — `date_from`/`date_to` filters
- `order.repository.ts:91, 97` — list filters

Reports module handles TZ correctly (`AT TIME ZONE 'Asia/Jakarta'` in `report-range.util.ts:7`). Orders module does not.

**Fix:** wrap with `dayjs().tz("Asia/Jakarta")`, load `utc` + `timezone` plugins globally at server bootstrap.

### 1.2 Refund cap discount allocation assumes order-level discounts only — MEDIUM (latent)
`order-admin.service.ts:265-276`

```ts
allocatedDiscount = (grossLine / grossTotal) * orderDiscount
```

Correct while every discount is order-wide. Breaks silently the moment a per-service campaign or dynamic repair pricing lands (both on roadmap).

**Fix now:** snapshot `discount_allocated` per `order_services` row at create time. Refund cap reads snapshot instead of recomputing.

### 1.3 Partial-amount refund within a single service is server-allowed — MEDIUM
`order-admin.service.ts` refund path caps by `maxRefundable - alreadyRefunded` per service but does not enforce "whole-amount only". API accepts 60 + 40 IDR refunds against a 100 IDR service. Business rule: whole-only, no dollar-partials within service.

**Fix:** reject if `amount !== refundableGross`, OR reject if any prior refund on same service exists.

### 1.4 Cancel reason lost on refund — MEDIUM (audit gap)
`order_services.cancel_reason` (free text) has no link to `order_refund_items.reason` (enum). If a cancelled service is later refunded, original text reason does not carry over.

**Fix:** FK from `refund_item` → `order_service` + read `cancel_reason` in refund view, OR copy text into refund note.

### 1.5 Product `is_active` not validated on order create — LOW-MED
`order.service.ts:300-358` validates existence + stock. Does not check `is_active`. Deactivated SKU still addable via API.

**Fix:** filter-or-reject in `productMap` lookup.

### 1.6 Stock: multi-branch model absent — SHIP-BLOCKER for multi-store
Schema has global `products.stock`. No per-branch stock, no `stock_transfers` log, no low-stock threshold. Memory flags this.

**Decision before prod:** either ship single-branch stock + manual reconciliation, or build `products_branch_stock` + transfer log now.

### 1.7 Migration hygiene
Memory says `intake_photo_path` + `order_service_photo_type_enum` dropped (commit 68a787b). Verify migration files carry no dead references before first prod migrate.

---

## 2. Verified OK (was worth double-checking)

- Pickup presign calls `assertCanProcessPickup` (`order-admin.service.ts:965`).
- `updateOrderPayment` requires `payment_method_id` via schema (`z.coerce.number().int().positive()`).
- Schema CHECK `(status='picked_up') = (pickup_event_id IS NOT NULL)` present at `schema.ts:524-526`.
- Status PATCH rejects direct `picked_up` transition → must go through pickup dialog.
- Drop-off photo: non-blocking, 1 per order, via `dropoff_photo_path`.
- Service detail photos: N per `order_services` with optional note.
- Public `/track` requires `code + phone_number` — **contradicts memory** ("order ID is enough"). See §3.1.

---

## 3. Ambiguities — need product call before prod

### 3.1 Pickup auth: memory vs code mismatch
- Memory: "order ID is enough — no proxy ID check".
- Code: public `/track` requires `code + phone_number`. Admin `/pickup-events` only needs order ID + staff JWT.

**Question:** pickup gated by (a) staff holds order ID handed over at counter, or (b) customer shows phone + code? Which screen does cashier use at pickup?

### 3.2 Refund after pickup
Code rejects refund once service is `picked_up`. Real world: customer returns item next day. Separate "return" flow, or extend refund to picked-up items?

### 3.3 Partial pickup of multi-service order
Schema permits multiple `pickup_events` per order. UI allows multi-select. Can customer pick up 2 of 3 services today, remaining 1 tomorrow? Confirm intended.

### 3.4 Campaign stacking ceiling
Vouchers stack with 10% Google review discount. No cap on campaign count per order. Max campaigns? Any mutex (e.g., only one percentage + one fixed)?

### 3.5 Unpaid / pay-on-pickup edge case
Memory: "full upfront dominant, unpaid edge case". Code supports `payment_status='unpaid'` on create + later `updateOrderPayment`. Who authorizes unpaid? Cashier freely, or admin-only toggle?

### 3.6 Cancel-with-reason: who, when, refund implication
- Must cancel auto-trigger refund if paid? Currently no — admin must do refund separately.
- Can worker cancel, or admin only?

### 3.7 Shift auto-close
Worker forgets to clock out at 22:00. Next day opens still in prior shift. Auto-close at store closing time? Admin manual close? Flag anomalies in reports?

### 3.8 Priority preemption
`is_priority` sorts queue. Worker mid-task not interrupted. Notification + "pause current" button, or accept current behavior (priority waits until free worker)?

### 3.9 Unclaimed items (30-day liability)
Memory: "no UI, no schema impact, pure liability disclaimer". Confirm no dashboard surfacing of >30-day items either? Or passive "aging items" list for ops awareness (no auto-status)?

### 3.10 Refund without original payment
Code rejects refund if `payment_status != paid`. Unpaid cancelled orders never generate refund record. Confirm intended.

---

## 4. Business context needed

### A. How items are treated
1. **Intake tagging** — each shoe tagged with `item_code`? Printed sticker or handwritten? Risk of lost/swapped tags?
2. **Per-pair vs per-shoe** — one `order_service` = one pair, or one shoe? Left+right tracked separately ever?
3. **Condition notes at drop-off** — currently no dedicated field → goes into drop-off photo + `order.notes` free-text. Enough?
4. **Damage disclaimers signed on drop-off?** Paper or digital? Legal artifact to store?
5. **Re-clean / redo flow** — QC rejects worker output → status back to `queued`? Same worker, or reassigned? Tied to "rework" metric in reports plan?

### B. Workflow
6. Step-by-step from counter → done. Who triggers each status transition? Does worker self-assign from queue, or does cashier assign?
7. **QC check** (status logs show `qc_check → processing`) — who performs it? Cashier, senior worker, admin?
8. **Multi-worker on one service** ever? (e.g., soaking vs brushing different workers.) Schema has single `handler_id`. Restrictive?

### C. Photos — usage, storage, policy
9. **Resolution/size targets** — currently presigned upload, no server-side size/mime validation. iPhone 6MB × 15K items/month → ~90GB/mo. Accept or client-side compress?
10. **Retention** — delete pickup photos after N days? Keep forever? Any legal/privacy constraint?
11. **Customer-visible photos on `/track`** — track endpoint does not return photo URLs. Intended? Show drop-off or pickup photo to customer?
12. **Photo count cap per service** — none enforced. Worker could upload 500. Cap at e.g. 10?
13. **Edit/delete photo by worker** — no delete endpoint surfaced. Confirm intentional.

### D. Devices
14. **POS (`/transactions`)** — iPad-class. Screen size (10" vs 13")? Orientation lock? Stylus or finger?
15. **Worker (`/worker`)** — device? iPad in wet area? Phone? Shared workstation? Photo capture = tablet camera or separate phone?
16. **Admin/owner** — desktop only? Also tablet for roaming owner?
17. **Printer** — thermal receipt? Label printer for `item_code` tags? Browser-driven printing in scope?
18. **Offline tolerance** — internet drops 10 min. POS queue orders locally or hard-fail? No offline layer today. Acceptable for v1?

### E. Remaining ship blockers
19. **Role matrix** — exact capabilities of `worker`, `cashier`, `admin`. Can cashier refund? (code says no.) Can worker cancel? (currently yes via status dropdown + reason.)
20. **Customer PII** — phone number as customer key. Duplicate phone handling? Soft merge?
21. **Receipts** — what does customer receive? WhatsApp link to `/track`? Printed? Both?
22. **Backup & DR** — Neon branch snapshots sufficient? Nightly dump off-site?
23. **Monitoring** — error logging (Sentry?), uptime, DB slow-query. Any wired?
24. **Secrets** — `JWT_SECRET`, `DATABASE_URL_PROD`, AWS S3 creds. Where managed? Rotation plan?

---

## 5. Risk ranking

| # | Finding | Severity | Effort |
|---|---------|----------|--------|
| 1.1 | Timezone bleed on order codes / filters | HIGH | Low |
| 1.6 | Multi-branch stock absent | HIGH (if multi-store v1) | High |
| 1.2 | Refund cap vs per-service campaigns | MEDIUM (latent) | Medium |
| 1.3 | Partial-amount refund loophole | MEDIUM | Low |
| 1.4 | Cancel reason lost on refund | MEDIUM | Low |
| 1.5 | Inactive product addable | LOW-MED | Low |
| 1.7 | Migration dead refs | LOW | Low |

---

## 6. Next step

Answer sections A–E + §3 ambiguities. Output becomes ordered pre-prod punch list with scoped fixes.
