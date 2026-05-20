# Payment is binary

An Order's `payment_status` is `paid` or `unpaid`. There is no partial or split state. Real-world scenarios needing partial payment (deposit now, balance on pickup) are modelled as **two separate Orders** — one paid, one unpaid.

## Why

- Cancel vs refund logic depends on a clean paid/unpaid split: cancel is unpaid-only, refund is paid-only. A "partial" state would force every guard to triple its branches and break the audit trail.
- The POS already supports creating multiple Orders for one Customer in one visit; the workaround is operationally cheap.
- Reporting (revenue, payment mix) stays additive across Orders rather than needing per-Order proration.

## Consequences

- DB enum `orderPaymentStatusEnum` stays `["paid", "unpaid"]`. Do not extend without explicit owner sign-off.
- Single PaymentMethod per Order — no split tenders either.
- Refund partial-amount inside one OrderService is currently server-allowed (deferred item D-11) but discouraged; tighten if audit signal appears.
