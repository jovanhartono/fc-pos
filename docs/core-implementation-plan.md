# Core Implementation Plan (v1 Ship Scope)

Date: 2026-04-22
Deferred items: `./deferred-actions.md`
Principles: simplify (delete > add), Vercel React composition (small typed units, RSC/client boundaries clean, hooks over HOCs, Zustand selectors not destructure).

---

## Guiding principles

### Simplify
- Every change: fewer lines if possible. Delete obsolete code same PR.
- No shims for non-existent callers. DB not in prod → drop/recreate freely, no migration gymnastics.
- One `useMutation` per form. Global `QueryClient` handles toasts.

### Vercel React composition (applied to SPA)
- **Primitives over props soup.** Compound components (`<Pickup.Dialog><Pickup.CodeField /></Pickup.Dialog>`) over one mega-component with 15 props.
- **Co-locate state with UI boundary.** If only pickup dialog needs pickup-code state → local `useState`, not Zustand.
- **Zustand for cross-cutting only** (`useDialog`, `useSheet`, `useAuthStore`). Selectors: `useDialog(s => s.closeDialog)`.
- **Context for scoped subtree** (e.g., `PickupEventContext` holds pickup_code + selected services).
- **Server as source of truth.** Generated `pickup_code` returned from API → web only displays. No client-side generation.
- **Early returns** for loading/error/empty. No nested ternaries.
- **`cn()` for conditional classes.** Tailwind-first.
- **Kebab-case components, camelCase hooks, named exports, arrow functions** (global CLAUDE.md).

---

## Core scope — grouped by risk

### Group A — Schema + migration (do first, one PR) ✅ DONE

Shipped: 2026-04-22 · PR [#26](https://github.com/jovanhartono/fc-bun-api/pull/26) · branch `feat/group-a-schema-foundations`

1. **A-1. Add `orders.pickup_code` (6-digit)** ✅
   - Column: `pickup_code varchar(6) NOT NULL DEFAULT lpad(floor(random()*1000000)::text, 6, '0')` — or generate in service with `crypto.randomInt(0, 1_000_000)` then pad.
   - Unique per order; does NOT need global uniqueness (scoped to order_id).
   - Rotation: never. One code per order lifetime.

2. **A-2. Add `order_service_status_enum.qc_reject`** ✅
   - Transition from `qc_check` → `qc_reject` → back to `processing` (same worker re-handles).
   - Update derived order status logic: `qc_reject` counts as active, not terminal.
   - Update seed to produce qc_reject samples.

3. **A-3. Customer phone unique constraint** ✅
   - `customers.phone_number` → UNIQUE.
   - Migration: dedupe existing data first (none in prod → trivial).
   - Service layer: return existing customer on duplicate phone instead of creating new; surface "customer exists" UX.

4. **A-4. Timezone fix (bug 1.1)** ✅
   - Bootstrap `dayjs` with `utc` + `timezone` plugins globally at server entry.
   - Wrap occurrences in `order.service.ts:328`, `order-admin.service.ts:440,449`, `order.repository.ts:91,97` with `.tz("Asia/Jakarta")`.
   - Add shared helper: `jakartaNow()`, `jakartaDayStart(date)`, `jakartaDayEnd(date)` in `src/utils/date.ts`.

5. **A-5. Validate `products.is_active` on order create (bug 1.5)** ✅
   - `order.service.ts:300-358`: add check in productMap lookup.

Commit: `feat(orders): pickup code + qc_reject status + timezone + is_active guard`

Follow-ups (not blocking merge):
- Wrap seed-internal `dayjs()` boundary calls (seedCatalog/seedShifts/seedOrders) with `.tz(JAKARTA_TZ)` — plugins now load, change is trivial.
- Web POS customer-create flow may need to surface "already exists" branch (route now returns 200 + `existed:true`).

---

### Group B — Pickup flow rewrite ✅ DONE

Shipped: 2026-04-23 · branch `feat/group-b-pickup-flow`

6. **B-1. Server: block pickup without code match** ✅
   - `createOrderPickupEvent` requires `pickup_code` in body, compared against `orders.pickup_code`; mismatches throw 400.
   - Rate limiting + attempts log deferred — kept simple for v1.

7. **B-2. Web: pickup dialog adds code input** ✅
   - Added `<InputOTP maxLength={6}>` (shadcn `input-otp`) as `PickupCodeField` in the existing compound pickup dialog (via context).
   - Submit disabled until 6 digits + ≥1 photo + ≥1 service selected.

8. **B-3. Track page shows pickup code to customer** ✅
   - Public `/track` returns `pickup_code` only when `order.status === 'ready_for_pickup'`; otherwise `null`.
   - Track page renders the code in the "Ready for pickup" banner. Admin `getOrderDetailById` strips `pickup_code` so cashiers cannot peek.

9. **B-4. Picked-up shortcut audit** ✅
   - Confirmed `ORDER_STATUS_TRANSITIONS` never offers `picked_up` as a next status; the only entry path is the pickup dialog.

Commit: `feat(pickup): 6-digit code auth + compound dialog + track-page display`

Follow-ups (not blocking merge):
- Run `bun run push:dev` + `bun run seed:dev` to create `order_pickup_attempts_log` and refresh demo data.

---

### Group C — Refund flow ✅ DONE

Shipped: 2026-04-24 · branch `feat/group-c-refund-cancel`

10. **C-1. Allow refund after pickup (ambiguity 3.2)** ✅
    - `order-admin.service.ts` refund path: dropped the "status must not be picked_up" guard. Payment_status=paid guard kept.

11. **C-2. Split cancel vs refund by payment status** ✅ *(supersedes original auto-refund-on-paid design)*
    - Business has binary payment (paid/unpaid — no partial). Cleaner split: cancel handles unpaid, refund handles paid. Removes auto-refund branching inside cancel.
    - **Server**: `cancelOrder` rejects paid orders (`"Paid orders cannot be cancelled. Issue a refund instead."`). `updateOrderServiceStatus` rejects `cancelled` transition on paid orders. `createOrderRefund` already paid-only — unchanged.
    - **Schema**: `refund_reason_enum` gains `customer_cancelled` for pre-pickup paid refunds initiated by the customer.
    - **Web**: order detail header shows `Cancel order` (unpaid) or `Refund order` (paid) — never both. Paid refund dialog seeds all refundable services with reason `customer_cancelled`. Per-line `cancelled` transition hidden on paid orders.

12. **C-3. Admin-only refund guard audit** ✅
    - `assertIsAdmin` gates `POST /admin/orders/:id/refunds` and `POST /admin/orders/:id/cancel`. Verified 2026-04-23: cashier + worker → 403.

Commits:
- `feat(refund): allow post-pickup + auto-refund on paid cancel` (12d8757 — C-1 + initial C-2 auto-refund)
- `refactor(orders): split cancel/refund by payment status` (this PR — supersedes C-2 auto-refund)

---

### Group D — Shifts

13. **D-1. Auto-close at 23:59 Jakarta**
    - Add cron-equivalent worker (Bun scheduled task or cron endpoint hit by external scheduler) that runs at 00:00 Jakarta. Sets `clock_out` on any `shifts.status='active'` rows to `23:59:59 of previous day` Jakarta.
    - If Bun scheduled tasks unavailable, expose `POST /admin/shifts/cron/auto-close` + document external trigger (Neon Cron / Upstash Schedule / GH Action).
    - Log each auto-closed shift with flag `auto_closed=true` for reports.

Commit: `feat(shifts): auto-close at 23:59 Jakarta`

---

### Group E — Photo delete

14. **E-1. Delete photo endpoint**
    - `DELETE /admin/orders/:id/services/:serviceId/photos/:photoId`.
    - Authz: uploader OR admin.
    - Soft delete (set `deleted_at`) not hard delete — keep audit trail, exclude from default query.
    - Do NOT delete S3 object (cost vs audit trade-off; add to D-5 future sweep if size becomes issue).

Commit: `feat(photos): soft-delete photo endpoint`

---

### Group F — Aging items UI (ambiguity 3.9)

15. **F-1. Aging queue view on dashboard**
    - New report endpoint: `/admin/reports/aging-queue` — lists `order_services` not in terminal status, ordered by `created_at ASC` (oldest first).
    - Web: add card to `/` dashboard or new panel in `/reports` "Operations" tab.
    - Columns: item_code, service, store, days waiting, current status, handler.
    - No action buttons — informational only.

Commit: `feat(reports): aging-queue view`

---

### Group G — Tablet ergonomics (sanity pass)

16. **G-1. Audit `/transactions` for hover-only interactions**
    - Scan all `hover:` in `apps/web/src/features/transactions/**` that lack a non-hover state.
    - Ensure `active:` / `focus-visible:` equivalents exist.
    - Verify touch targets ≥ 44×44 px.
    - No new features — cleanup pass only.

Commit: `style(transactions): tablet-friendly active/focus states`

---

## Execution order

```
A (schema) → B (pickup) ─┐
                         ├→ C (refund) ─→ D (shifts) ─→ E (photo delete) ─→ F (aging) ─→ G (polish)
                         │
(E can run parallel to C/D if helpful)
```

Each group = one PR. Each PR independently shippable.

---

## Verification checklist (per PR)

- [ ] `bun x ultracite fix` clean from repo root
- [ ] `bun run type-check` clean (run twice if FileRoutesByPath lags)
- [ ] `bun run push:dev` + `bun run seed:dev` repopulates demo data
- [ ] Manual smoke on POS tablet viewport (iPad 10.9" portrait + landscape)
- [ ] No `console.log` / `debugger` / `any` added
- [ ] No barrel re-export files added
- [ ] Named exports, arrow functions, kebab-case files

---

## Locked decisions (2026-04-22)

1. **B-1 attempt logging:** ~~attempts table + rate-limit~~ — reverted 2026-04-23, kept simple for v1. No throttle; mismatched code just returns 400.
2. **C-2 cancel vs refund split:** (revised 2026-04-24) cancel = unpaid-only, refund = paid-only. Original auto-refund-on-paid-cancel design reverted: simpler to gate by payment status. Binary payment model (paid/unpaid, no partial) keeps the split unambiguous — partial-payment scenarios are split into two orders operationally.
3. **C-3 admin-only refund:** `assertCanProcessPaymentOrRefund` tightened to `role==='admin'` for refund endpoint. Payment collection remains cashier+admin.
4. **D-1 auto-close trigger:** Upstash Schedule → HTTP POST to `/admin/cron/shifts/auto-close` (internal shared-secret header). Runs at 00:05 Jakarta daily (cushion for clock drift).
5. **E-1 photo delete:** soft delete (`deleted_at`, `deleted_by`). S3 object stays (future sweep).
6. **F-1 aging queue placement:** card on `/` dashboard showing top-5 oldest; "View all" links to `/reports?tab=aging-queue` (new tab) with full paginated list.
7. **G-1 tablet polish scope:** `/transactions` only for v1. Other admin pages deferred.

---

## What happens next

Executing groups A→G sequentially. Each group = one commit. Total estimated diff: ~2K LOC net add, ~500 LOC deleted (dead refund-guard, status dropdown options, migration cleanups).

Once all groups land, prod-ready punch list closes except items in `./deferred-actions.md`.
