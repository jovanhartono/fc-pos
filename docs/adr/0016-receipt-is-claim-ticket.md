# Receipt is the claim ticket

Thermal receipt printing (deferred item D-4, revived 2026-07-06 when the first store's printer arrived) prints a customer Receipt at drop-off and on demand from the Order. Decision: **the printed Receipt carries the pickup code**, making the paper the physical claim ticket — amending [ADR-0005](0005-pickup-code-authentication.md), which barred the code from every admin/cashier surface before `ready_for_pickup`.

## Why

- The Receipt already carries the Order code and the customer's phone number — the exact `/track` credential pair — so any receipt holder could read the pickup code off `/track` at ready-time regardless. Printing the code directly adds customer convenience, not a materially new leak for outsiders holding the paper.
- Physical claim tickets are the established laundry-counter convention; the drop-off paper is what customers expect to present at pickup.

## Consequences

- The cashier can see the pickup code from Order creation onward. A dedicated receipt read is the **single sanctioned surface** that returns `pickup_code` — reprints included, so a lost claim ticket can be replaced. The insider "customer-presence bypass" that ADR-0005's consequence protected against is **accepted residual risk**, mitigated operationally (the pickup dialog still confirms the customer name) and bounded by the payment gate ([ADR-0009](0009-payment-precedes-pickup.md)).
- The receipt read must stay textually separate from the stripped order-detail read (`getOrderDetailById`) so `pickup_code` never threads back into general admin responses.
- `/track` behavior is unchanged (reveals the code only at `ready_for_pickup`) — it remains the digital path and the lost-receipt fallback.
