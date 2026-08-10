# A price is known or blank; discounts resolve at payment

**Repair** — replacing leather, panels, or structure on an Item — has no list price. What it costs depends on how much has to be replaced, and that is only knowable after inspection. Every other Service reads its price from the catalog; Repair cannot. Two questions look like one and must be kept apart:

- **Catalog:** does this Service have a list price? Repair never does — `services.price` is nullable, and Repair is the NULL row.
- **Line:** is *this* line's price known yet? For a Repair at intake, usually not.

We decided that an OrderService's price is either **known or blank** — `orders_services.price` is nullable, NULL means "not yet determined", and there is no second number, no mode flag, and no confirmation step — that the Order is **always created at drop-off** regardless, and that **discounts resolve at payment**, not at order creation. The last is the keystone, and it was the owner's own idea: every number is final at the moment money moves, so the Campaign base is simply the order total.

The failure the payment-time rule makes structurally impossible, rather than merely guards against:

> Two Items, one Order. Deep clean 150k plus a Repair guessed at 200k. Gross 350k clears a "20% off, min order 250k" Campaign, and its Voucher code is claimed — bearer, single-use, atomic ([ADR-0015](0015-campaign-usage-limit-and-vouchers.md)). Inspection then puts the Repair at 80k. Gross is 230k; the Campaign should never have applied. The code is already spent, and it is money.

Any design that claims a discount while a price can still move has to defend against this state. Resolving discounts at payment — after the no-price-no-payment gate has forced every line to a final number, at the same moment prices freeze — means the check never reads a number that can move afterwards. The state is not handled; it cannot occur.

## Considered options

- **Priced-or-blank line, discounts resolved at payment (chosen).**
- **Firm-vs-Estimate line modes with a confirmation step.** The cashier types a price at intake and marks it firm (payable now, the shop absorbs inspection surprises) or an Estimate (provisional, blocking payment until confirmed after inspection). Rejected: it forces the cashier to invent a number for a job whose whole premise is that the number is not knowable yet, and then pick a mode for that invented number — the invented number, not the toggle, is the source of counter confusion. And because a claimed discount had to survive a moving price, the Campaign base had to exclude every no-list-price line, *firm ones included* — a rule (a firm 900k repair does not count toward a 250k minimum) that no one could explain to a customer. The owner explicitly wants repair spend to count.
- **Re-evaluate Campaigns whenever a price changes.** Rejected: it requires un-claiming and re-claiming bearer Voucher codes and usage-limit slots, and it can strip a discount from a customer who already saw it. Resolving once, at payment, needs none of that machinery.
- **Don't create the Order until the price is agreed over WhatsApp.** Rejected, and this is the reasoning worth keeping. `item_code` (the physical tag), the drop-off photo ([ADR-0012](0012-photo-precedes-processing.md)), and the Receipt-as-claim-ticket ([ADR-0016](0016-receipt-is-claim-ticket.md)) all derive from the Order. Deferring Order creation would leave a customer's item sitting in the shop with no tag, no photo, no claim ticket, and no record — on exactly the highest-value, highest-dispute-risk service. That state does not disappear when you stop modelling it; it regrows as a paper logbook or a WhatsApp thread on one cashier's phone.
- **Encode "not yet priced" as `price = 0`.** Rejected: zero already means *deliberately free* — that is what a Rework line is ([ADR-0013](0013-complaint-and-rework-line.md)). Conflating the two makes them indistinguishable in every report, refund calculation, and receipt.

## Decisions

- **Repair is one Service with no list price.** `services.price` is nullable. Splitting Repair into narrower catalog rows would not remove the variance — it lives *inside* the job type, not between job types.
- **One nullable price per line.** `orders_services.price` NULL = not yet determined. No `estimated_price`, no `estimate_confirmed_at`, no firm/estimate flag, no confirm endpoint.
- **The Order is always created at drop-off** — tag, drop-off photo, receipt, claim ticket, queue row — whether or not any price is known.
- **A blank price is filled in later**, after inspection, typically agreed with the customer over WhatsApp. A price may also be **corrected** while the Order is unpaid — typos happen. Every set-or-correct is logged with the acting user (`order_service_price_logs`). Payment freezes prices.
- **Payment gate: an Order with any non-cancelled unpriced line cannot be marked paid.** The counter rule is one sentence: *no price, no payment*. Server-side, on the paid transition.
- **Discounts resolve at payment, not at order creation.** An unpaid Order carries discount 0 and claims nothing — no Voucher code, no usage-limit slot. Campaign eligibility and minimums are checked when the Order is marked paid, against the order total, which by the gate above is fully priced and about to be frozen. No line is carved out of the base.
- **BOGO stays exclusive: a no-list-price line cannot be selected as a buy-one-get-one free slot.** Deliberate owner decision — a misconfigured Campaign must not give away a repair. This exclusion is different in kind from the base carve-out the chosen model does without: it keys on catalog configuration (the Service has no list price), not on a number that might move.

## Consequences

- **An Order cancelled before payment never burned its Voucher code or usage slot, so no release path is needed for it.** [ADR-0015](0015-campaign-usage-limit-and-vouchers.md)'s claim-once guarantee holds with less machinery: cancel is unpaid-only ([ADR-0008](0008-cancel-is-unpaid-per-line-refund-twin.md)), and unpaid Orders hold no redemptions.
- **Campaign usage slots are no longer consumed by Orders that never pay.**
- **An unpaid Order's drop-off Receipt shows the gross total**, since the discount is not settled until pickup — staff must say this out loud. Consistent with [ADR-0016](0016-receipt-is-claim-ticket.md): the Receipt is a claim ticket first and a total second.
- **A quoted-vs-final variance report is not buildable** — there is no intake guess to compare a final price against, so "which cashier quotes badly" is not measurable. The price log still records *who* set each price, so favouritism remains auditable. Accepted cost, not an oversight.
- Schema (`services.price` and `orders_services.price` dropping NOT NULL, `order_service_price_logs`) is applied to dev only and must reach prod via `push:prod` before the next deploy — see `TODO.md`.
