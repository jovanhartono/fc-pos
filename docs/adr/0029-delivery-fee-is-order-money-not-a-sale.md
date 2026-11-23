# Delivery fee is Order money, not a sale

Shops sometimes charge a far-away Customer for fetching their Items and bringing them back, made by a Courier or, when the Couriers are fully booked, by GoSend, GrabExpress or Lalamove. We record it as one optional **Delivery fee** amount on the Order, not as a Line, so it stays outside everything that works Line by Line. Any Order can carry one, with or without a Courier, so this ADR replaces [ADR-0010](0010-courier-role-login-only-excluded-by-allowlist.md)'s "the Courier is the only sign of a delivery": `collected_by` still names who fetched the Items, and the fee says what the Customer paid for the trips.

- **One fee covers both trips**, typed by the cashier in Rupiah at checkout; blank means none. Anyone who takes payment can change it, like the Courier, until the Order is paid, then locked, since payment is all-or-nothing ([ADR-0001](0001-payment-is-binary.md)). An edit cancels any open QR, like every other change to the amount due.
- **Campaigns never see it.** It is never discounted and never counts toward a minimum order total.
- **A Refund never returns it**, even when every Line is refunded: the trips happened. Refunds stay Line by Line ([ADR-0007](0007-product-refunds-whole-line-money-only.md)).
- **Reports count it as money, not as sales.** It is in Collected, Revenue, Lifetime spend and the Day close, but not Gross sales, which values only what was sold on Lines. [ADR-0023](0023-reports-count-money-when-it-is-paid.md)'s walk-down becomes Gross sales − discounts + Delivery fees = Collected.

## Considered options

- **A "Delivery fee" Product.** Rejected: Products carry a fixed price and stock, Campaigns would discount it, and a Refund would hand it back.
- **A new kind of Line.** Rejected: every refund, report and Receipt path would need a third Line type for one number.
- **A fee only when a Courier is set.** Rejected once third-party services came up: those trips have no Courier to pick.
