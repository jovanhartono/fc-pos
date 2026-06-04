# Role capabilities — v1 locked

Three roles with disjoint capabilities. Locked for v1; do not blur the lines.

> **Amended 2026-06-04:** the processing axis is now open to all staff — see [Amendment](#amendment-2026-06-04--processing-axis-open-to-all-staff). Money and admin operations remain role-gated exactly as below.

## Capabilities

| Capability | Cashier | Worker | Admin |
| --- | :---: | :---: | :---: |
| Create paid Order | ✅ | — | ✅ |
| Create unpaid Order | ✅ | — | ✅ |
| Apply existing Campaign | ✅ | — | ✅ |
| Process pickup (collect payment, validate pickup code) | ✅ if `can_process_pickup=true` | — | ✅ |
| Self-assign OrderService from queue | ✅ | ✅ | ✅ |
| Update OrderService status during processing | ✅ | ✅ | ✅ |
| Upload service detail photos | ✅ | ✅ | ✅ |
| Cancel OrderService on an **unpaid** Order | ✅ | ✅ | ✅ |
| Refund OrderService on a **paid** Order | — | — | ✅ |
| Create / edit Campaigns | — | — | ✅ |

## Cancel and refund — two disjoint off-ramps

An OrderService exits without delivery via exactly one of two paths, gated by the Order's `payment_status`:

- **Unpaid Order → Cancel.** Sets `orders_services.status = 'cancelled'`. Records `cancel_reason` from `cancelReasonEnum` (`customer_request`, `cannot_process`, `damaged_intake`, `duplicate_order`, `other`); `cancel_note` is required when reason is `other`. No money movement (nothing was paid).
- **Paid Order → Refund.** Sets `orders_services.status = 'refunded'`. Server inserts an `order_refunds` row plus per-service `order_refund_items` rows. Each refund_item carries a `refundReasonEnum` value (`damaged`, `cannot_process`, `lost`, `other`, `customer_cancelled`) chosen **manually by the admin in the refund dialog**, plus an optional per-item note (required when reason is `other`).

**Cancel is blocked on paid Orders. Refund is blocked on unpaid Orders.** The two states never overlap; there is no cascade from cancel to refund. A customer who paid and later wants to cancel goes through the refund flow with `refundReasonEnum='customer_cancelled'` selected by the admin.

**Money is out of band.** The POS records the state change only — no payment-gateway integration. Refunds are transferred manually (cash, bank transfer, etc.) by store staff after the admin records the refund.

**Refund after pickup is allowed.** The only guard on refund is `payment_status = 'paid'`. Returns and quality complaints work for already-delivered Orders.

## Cancel-reason vs refund-reason — distinct enums

The two off-ramps use different enums. They are **not** mirrored.

```
cancelReasonEnum (orders_services.cancel_reason)
  customer_request
  cannot_process
  damaged_intake
  duplicate_order
  other

refundReasonEnum (order_refund_items.reason)
  damaged
  cannot_process
  lost
  other
  customer_cancelled
```

Overlap is partial (`cannot_process`, `other`). Each enum lives on a different table and serves a different flow; do not try to unify them.

## Why

- Cashier-facing operations stay fast; cashiers do not gate revenue reversal.
- Workers own the work and have ground truth on damage / can't-process during processing; cancel-with-reason captures it on unpaid Orders.
- Admin gate on refund concentrates audit trail in one role and matches the manual money-movement step (admin is the role that physically initiates the transfer).
- Disjoint off-ramps simplify status guards: every guard reads `payment_status` once and picks the allowed path. A "partial" or "overlapping" state would force every reversal to triple its branches.

## Consequences

- Do not add cashier refund flows even for "small" amounts.
- Do not add worker pricing / discount overrides.
- Do not build an "auto-refund on cancel" cascade — paid-Order cancellation is not a real operation; the admin runs the refund dialog instead.
- Any UX that initiates reversal must read `payment_status` first to choose the dialog (cancel vs refund). The two off-ramps are not interchangeable.
- The status conflation between processing axis and terminal-outcome axis (see [CONTEXT.md](../../CONTEXT.md) "OrderService status") is accepted for v1 and recorded for the Order Status Machine refactor.

## Amendment 2026-06-04 — processing axis open to all staff

Field reality contradicted the locked matrix: staff roles are fluid on the floor. A cashier QCs pairs when the bench backs up; whoever is free does the work. The worker/cashier wall on the processing axis blocked legitimate operations (a cashier could not move `quality_check → ready_for_pickup`) while adding no safety — the original rationale for the wall was accountability, which the audit logs already provide.

**New rule: role gates money and admin operations; the processing axis is open to any authenticated staff.**

Opened to all three roles:

- Self-assign OrderService from queue
- Update OrderService status during processing
- Upload service detail photos

Unchanged (the rule's other half):

- Create Order, process payment — admin/cashier
- Process pickup — admin/cashier/`can_process_pickup` flag (pickup collects money)
- Refund, reassign handler, manage Campaigns/Users — admin only
- Cancel — any staff, still gated by `payment_status = unpaid`; the disjoint off-ramps stand

Why audit survives without the role wall: every status transition records `changed_by` in `order_service_status_logs`; every handler change is appended to `order_service_handler_logs`. The poach guard (cannot self-assign an item whose `handler_id` belongs to someone else) is handler-based, not role-based, and stays.

Lockstep with [ADR-0006](0006-permissions-module-shape.md): capabilities open to all staff have **no** `assertCan*` function — `permissions.ts` lists only restricted capabilities. `adminMiddleware` (JWT + DB auth-state refresh, see [ADR-0006](0006-permissions-module-shape.md)) is the sole gate on open rows. A matrix row of all-✅ therefore corresponds to *absence* of an assert, deliberately.
