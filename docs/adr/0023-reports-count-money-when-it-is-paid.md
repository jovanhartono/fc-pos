# Reports count money when it is paid

Reports book money on the day it is paid (`orders.paid_at`), not on the day the Item is collected: the shop reports on a cash basis. Payment comes before pickup ([ADR-0009](0009-payment-precedes-pickup.md)), so money taken at drop-off counts as Revenue before the Item is cleaned. v1 records nothing owed against that gap. A refund comes off Revenue in the period it is issued, never by reopening the month of the sale it undoes: a June Order refunded in July lowers July. Moving to counting at pickup would change the basis of every past figure, so treat any request for it as a decision, not a bug fix.

## Three figures, one walk-down

Each money panel reports exactly one of the glossary's three figures and is labelled with its name:

- **Gross sales** − discounts = **Collected**
- **Collected** − refunds = **Revenue**
- **Revenue** − COGS = gross profit

## Consequences

- **Payment mix, top customers and campaign effectiveness can only report Collected.** All three sum `orders.paid_amount`, and a refund carries neither a payment method nor a Campaign, so there is nothing to subtract it from. Label them Collected, not Revenue.
- **A customer's Lifetime spend is Revenue's twin but all-time.** It subtracts refunds whenever they happened, because it answers what the Customer is worth today rather than what a month earned. So it reads lower than the top-customers panel for anyone ever refunded ([ADR-0021](0021-customer-detail-is-admin-only-and-all-store.md)).
