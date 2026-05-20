# Overcomplexity & Ambiguity Audit

Date: 2026-04-28
Scope: server + web + schema (post v1 ship)
Source: deep scan of `packages/server/src/` + `apps/web/src/` + `packages/server/src/db/schema.ts` against locked v1 scope (now archived).

Status legend: ✅ shipped · 🟡 open · ⏸ deferred · ✓ verified clean

---

## Already shipped from this audit

| Item | Where | PR |
| --- | --- | --- |
| Cancel reason free-text → `cancelReasonEnum` (`customer_request | cannot_process | damaged_intake | duplicate_order | other`) | `db/schema.ts`, `order-admin.{schema,service}.ts`, web cancel forms | [#30](https://github.com/jovanhartono/fc-bun-api/pull/30) |
| `cancel_note` column for "other" path; mirrors refund-reason shape | same | #30 |
| `cancelReasonPatch` splat dance dropped — single `setPatch` object, single `update().set()` call, handler-log insert hoisted out of duplicated branches | `order-admin.service.ts:868-905` | #30 |
| `formatRefundReason` duplicated in 2 files → extracted to `lib/status.ts`; `CANCEL_REASONS` / `REFUND_REASONS` constants colocated | `lib/status.ts`, `refund-order-form.tsx`, `orders.$orderId.tsx` | #30 |
| `service-cancel-form.tsx` + `cancel-order-form.tsx` rebuilt on react-hook-form + `zodResolver` + `Select` (per project convention) | feature/orders/components/ | #30 |

---

## HIGH — open

### Schema NOT NULL gaps on snapshot columns
Generated `subtotal` columns become NULL when `price` is NULL. Order rows can orphan via nullable `order_id`.

| File:line | Column | Fix |
| --- | --- | --- |
| `db/schema.ts:383` | `ordersTable.total` | add `.notNull()` |
| `db/schema.ts:480` | `ordersServicesTable.order_id` | add `.notNull()` |
| `db/schema.ts:490` | `ordersServicesTable.price` | add `.notNull()` |
| `db/schema.ts:685` | `ordersProductsTable.order_id` | add `.notNull()` |
| `db/schema.ts:690` | `ordersProductsTable.price` | add `.notNull()` |

Single migration, ~10 lines, DB not in prod → no data risk.

### Duplicate `recalculateOrderStatus`
`order-admin.service.ts:197` and `:1235` (`recalculateOrderStatusDirect`) — bodies identical, only `tx` vs `db` differs. Drizzle's query API matches across both, so a single `recalculateOrderStatus(dbOrTx, orderId, updatedBy)` works. ~30 LOC deleted.

### Web style violations (`CLAUDE.md` rules — non-negotiable)
- `routes/_admin/orders.$orderId.tsx:87,108,131,162,260` — five `function` declarations (`OrderDetailSkeleton`, `OrderDetailMessage`, `OrderDetailPage`, `OrderPickupHistoryCard`, `AdminOrderDetailPage`). Rule = arrow components.
- `features/reports/panels/*.tsx` — all 9 panels carry both `export const` and `export default`. Default exports forbidden. Drop `export default`.
- `routes/track.tsx:48` — `type Stage = {...}` should be `interface Stage`.

---

## MEDIUM — open

### Mega files
Split into feature-module subcomponents.

| File | LOC | Suggested split |
| --- | --- | --- |
| `routes/_admin/orders.$orderId.tsx` | 956 | `OrderServiceCard`, `OrderPickupHistoryCard`, `DeletePhotoConfirmDialog`, `AdminOrderDetailPage` → `features/orders/components/` |
| `routes/_admin/worker.index.tsx` | 936 | scanner state + filter UI to dedicated subcomponents |
| `features/transactions/components/transactions-checkout.tsx` | 757 | review-checkout, cart-mini-bar, payment selector |
| `modules/orders/order-admin.service.ts` | ~1500 | `order-status.service.ts` (recalc + transitions), `order-refund.service.ts`, `order-pickup.service.ts` |
| `lib/api.ts` | 1280 | `api/orders.ts`, `api/reports.ts`, etc. |

### Schema overlap — two sources of truth
- `ordersTable.cancelled_at` + `status='cancelled'`
- `ordersTable.paid_at` + `payment_status='paid'`

Today: status updates without timestamp updates = silent drift. Pick canonical (timestamp = source, status derived) OR drop the timestamps.

### `timestamp` not `timestamptz`
With Jakarta-everywhere rule, type-level `timestamptz` would prevent the bug class A-4 patched at runtime. Sweep `db/schema.ts`.

### `ORDER_STATUS_TRANSITIONS` ignores `payment_status`
`order-admin.schema.ts:8-20` — locked C-2 rule (cancel = unpaid, refund = paid) lives in service-layer guards (`order-admin.service.ts:861, 1293, 1432`). New dev reading the transitions table won't see paid/unpaid split. Either bake `payment_status` into transition shape, or add comment pointing at runtime guards.

### Date format drift
`routes/_admin/index.tsx:278` — `toLocaleDateString` for what reads like a server param. Use `dayjs(d).format("YYYY-MM-DD")` per `apps/web/AGENTS.md`.

---

## LOW — open

- `utils/helper.ts:9` — `notFoundOrFirst` exported, zero callers. Delete.
- `utils/helper.ts:5` — `getNumericValue` one caller (`schema/common.ts`). Inline or move next to caller.
- `ordersServicesTable.item_code` UNIQUE on nullable column = multiple NULLs allowed. Confirm v1 every order_service gets `item_code` at create.
- `shifts` unique index allows multiple open shifts per user across stores — confirm intended; revisit when D-1 (auto-close) ships.
- D-11 partial-amount refund within service still server-allowed — `order-admin.service.ts` refund accepts `60 + 40` on a 100 IDR service. Listed deferred. Watch for first audit.

---

## ✓ Verified clean — worth keeping

- **C-2 cancel/refund split actually enforced.** Guards at `order-admin.service.ts:1293` (`createOrderRefund` rejects unpaid) and `:1432` (`cancelOrder` rejects paid). Per-service path also blocks at `:861`. Earlier scan suggested the guard was missing — verified present.
- **Pickup code never leaks to admin/cashier.** Stripped at `order-admin.service.ts:603` (`getOrderDetailById`). Public `/track` exposes only when `status === 'ready_for_pickup'` (`public/orders.ts:120`).
- **Stock decrement is transactional.** `order.service.ts:359` runs inside `db.transaction(...)`. An earlier scan flagged it as non-idempotent — that was wrong; rollback is implicit.
- **Photo soft-delete read filters consistent.** Verified across `getOrderDetailById` images relation, `listOrderServiceImages`, `findOrderServiceImageById` — all filter `deleted_at IS NULL` (per Group E-1).

---

## Business ambiguities resolved 2026-04-28

| Question | Answer | Where stored |
| --- | --- | --- |
| Partial pickup of multi-service order? | ALLOWED — schema + UI correct as-is. No "all-or-nothing" guard. | `memory/project_business_rules.md` |
| Who can create `payment_status='unpaid'`? | Cashier-OK, no role gate. Pay-on-pickup is normal. | same |
| Campaign stacking cap? | Deferred (D-10 stays parked). Revisit only on discount-leakage signal. | same |
| Cancel-reason → refund-note linkage (D-19)? | Unnecessary — cancel is terminal. Paid customer-cancellation goes through refund flow with `customer_cancelled` reason. | n/a — D-19 closeable in `deferred-actions.md` |

---

## Top 5 to fix next

1. **Add `.notNull()`** to 5 schema columns (`ordersTable.total`, `ordersServicesTable.{order_id,price}`, `ordersProductsTable.{order_id,price}`). ~10 lines.
2. **Merge `recalculateOrderStatus` + `Direct`** — single function taking `dbOrTx`. ~30 LOC deleted.
3. **Convert 5 function declarations → arrow** in `orders.$orderId.tsx`. Mechanical.
4. **Drop 9 `export default`** lines from `features/reports/panels/*.tsx`. Mechanical.
5. **Pick canonical** — timestamp OR status — for cancelled/paid; drop the redundant write paths.

Estimate: ~4 hours total. Closes 7 confirmed defects + biggest convention drift.

---

## What's deferred (revisit triggers)

See `./deferred-actions.md` for the canonical D-1..D-19 list. D-19 can now close (cancel terminal, no link path).

Big-effort splits (mega files, schema timestamp sweep) — open but not blocking. Slot into a "polish" PR when adjacent work touches them.
