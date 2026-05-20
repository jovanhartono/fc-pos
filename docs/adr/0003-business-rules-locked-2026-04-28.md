# Business rules locked 2026-04-28

Three operational rules confirmed during the v1 ship audit and intentionally not configurable:

1. **Partial pickup is allowed.** A Customer may collect a subset of their OrderServices in one OrderPickupEvent and the rest in later events. The schema supports multiple `order_pickup_events` per Order; no UI or service-layer "all-or-nothing" guard exists or should be added.
2. **Cashiers may create unpaid Orders.** Pay-on-pickup is a normal flow, not a privileged action. No role gate on `payment_status='unpaid'` at create.
3. **Campaign stacking cap is deferred.** Multiple Campaigns may stack on one Order. A cap (max-N, max-percent, max-amount) is parked until a discount-leakage signal appears (deferred item D-10).

## Why

- All three reflect how the shops actually operate. Adding guards would block legitimate flows and force workaround Orders that pollute reports.
- Partial-pickup-blocking was raised in audit; ops confirmed it would force splitting Orders unnecessarily.
- Cashier-unpaid was raised as a permission concern; ops confirmed no business rule attaches to it.
- Stacking cap was proposed defensively; ops confirmed no observed abuse and existing Campaigns are scoped narrowly enough that stacking is rare.

## Consequences

- New code must not introduce these guards "for safety" — each was rejected with a reason.
- Reopen only if: (1) audit shows pickup-state drift, (2) unpaid creates correlate with fraud, or (3) discount stacking produces > 5% revenue leakage in reports.
