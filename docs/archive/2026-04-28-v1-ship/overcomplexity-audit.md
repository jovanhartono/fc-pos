# Overcomplexity & Ambiguity Audit

Date: 2026-04-28
Scope: server + web + schema (post v1 ship)
Source: deep scan of `packages/server/src/` + `apps/web/src/` + `packages/server/src/db/schema.ts` against locked v1 scope (now archived).

Status legend: ✅ shipped · 🟡 open · ⏸ deferred · ✓ verified clean

Re-verified against `main` 2026-06-22 — obsolete findings removed, survivors re-pinned to current line numbers.

---

## Already shipped from this audit

Line refs below predate the `order-admin.*` → `modules/orders/order-*` split; kept as historical record of PR #30.

| Item | Where | PR |
| --- | --- | --- |
| Cancel reason free-text → `cancelReasonEnum` (`customer_request | cannot_process | damaged_intake | duplicate_order | other`) | `db/schema.ts`, `order-admin.{schema,service}.ts`, web cancel forms | [#30](https://github.com/jovanhartono/fc-bun-api/pull/30) |
| `cancel_note` column for "other" path; mirrors refund-reason shape | same | #30 |
| `cancelReasonPatch` splat dance dropped — single `setPatch` object, single `update().set()` call, handler-log insert hoisted out of duplicated branches | `order-admin.service.ts` (now split) | #30 |
| `formatRefundReason` duplicated in 2 files → extracted to `lib/status.ts`; `CANCEL_REASONS` / `REFUND_REASONS` constants colocated | `lib/status.ts`, `refund-order-form.tsx`, `orders.$orderId.tsx` | #30 |
| `service-cancel-form.tsx` + `cancel-order-form.tsx` rebuilt on react-hook-form + `zodResolver` + `Select` (per project convention) | feature/orders/components/ | #30 |

---

## HIGH — open

### Schema NOT NULL gaps on snapshot columns
Generated `subtotal` columns become NULL when `price` is NULL. Order rows can orphan via nullable `order_id`. All 5 still lack `.notNull()`; CHECK constraints added since don't cover NULL.

| File:line | Column | Fix |
| --- | --- | --- |
| `db/schema.ts:425` | `ordersTable.total` | add `.notNull()` |
| `db/schema.ts:525` | `ordersServicesTable.order_id` | add `.notNull()` |
| `db/schema.ts:535` | `ordersServicesTable.price` | add `.notNull()` |
| `db/schema.ts:745` | `ordersProductsTable.order_id` | add `.notNull()` |
| `db/schema.ts:750` | `ordersProductsTable.price` | add `.notNull()` |

Single migration, ~10 lines, DB not in prod → no data risk.

### Web style violations (`CLAUDE.md` rules — non-negotiable)
- `routes/_admin/orders.$orderId.tsx:76,94` — two `function` declarations remain (`OrderDetailPage`, `AdminOrderDetailPage`) after the split. Rule = arrow components. (Down from 5; the other three moved to `features/orders/components/`.)
- `features/reports/panels/*.tsx` — all 9 panels carry both `export const` and `export default`. Default exports forbidden. Drop `export default`.
- `routes/track.tsx:48` — `type Stage = {...}` should be `interface Stage`.

---

## MEDIUM — open

### Mega files
Split into feature-module subcomponents.

| File | LOC | Suggested split |
| --- | --- | --- |
| `routes/_admin/worker.index.tsx` | 882 | scanner state + filter UI to dedicated subcomponents |
| `features/transactions/components/transactions-checkout.tsx` | 722 | review-checkout, cart-mini-bar, payment selector |
| `lib/api.ts` | 1310 | `api/orders.ts`, `api/reports.ts`, etc. |

### `timestamp` not `timestamptz`
With Jakarta-everywhere rule, type-level `timestamptz` would prevent the bug class A-4 patched at runtime. Sweep `db/schema.ts` (0 `timestamptz`, 36 `timestamp(` as of 2026-06-22).

---

## LOW — open

- `utils/helper.ts:5` — `getNumericValue` one caller (`schema/common.ts:46`). Inline or move next to caller.
- `ordersServicesTable.item_code` UNIQUE (`schema.ts:571`) on nullable column (`:523`) = multiple NULLs allowed. Confirm v1 every order_service gets `item_code` at create.
- D-11 partial-amount refund within service still server-allowed — refund accepts `60 + 40` on a 100 IDR service. Listed deferred. Watch for first audit.

---

## Business ambiguities resolved 2026-04-28

| Question | Answer | Where stored |
| --- | --- | --- |
| Partial pickup of multi-service order? | ALLOWED — schema + UI correct as-is. No "all-or-nothing" guard. | `memory/project_business_rules.md` |
| Who can create `payment_status='unpaid'`? | Cashier-OK, no role gate. Pay-on-pickup is normal. | same |
| Campaign stacking cap? | Deferred (D-10 stays parked). Revisit only on discount-leakage signal. | same |
| Cancel-reason → refund-note linkage (D-19)? | Unnecessary — cancel is terminal. Paid customer-cancellation goes through refund flow with `customer_cancelled` reason. | n/a — D-19 closeable in `deferred-actions.md` |

---

## Top to fix next (re-prioritized 2026-06-22)

1. **Add `.notNull()`** to 5 schema columns (`ordersTable.total`, `ordersServicesTable.{order_id,price}`, `ordersProductsTable.{order_id,price}`). ~10 lines.
2. **Drop 9 `export default`** lines from `features/reports/panels/*.tsx`. Mechanical.
3. **Convert 2 function declarations → arrow** in `orders.$orderId.tsx` (`OrderDetailPage`, `AdminOrderDetailPage`); `type Stage` → `interface Stage` in `track.tsx`. Mechanical.

Big-effort items (remaining mega-file splits, `timestamptz` sweep) — open but not blocking. Slot into a "polish" PR when adjacent work touches them.

---

## What's deferred (revisit triggers)

See `./deferred-actions.md` for the canonical D-1..D-19 list. D-19 can now close (cancel terminal, no link path).
