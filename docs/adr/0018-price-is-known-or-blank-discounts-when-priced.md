# A price is known or blank; discounts settle once every line is priced

**Repair** — replacing leather, panels, or structure on an Item — has no list price. What it costs depends on how much has to be replaced, and that is only knowable after inspection. Every other Service reads its price from the catalog; Repair cannot. Two questions look like one and must be kept apart:

- **Catalog:** does this Service have a list price? Repair never does — `services.price` is nullable, and Repair is the NULL row.
- **Line:** is *this* line's price known yet? For a Repair at intake, usually not.

We decided that an OrderService's price is either **known or blank** — `orders_services.price` is nullable, NULL means "not yet determined", and there is no second number, no mode flag, and no confirmation step — that the Order is **always created at drop-off** regardless, and that **discounts settle once every line on the Order is priced**, whenever that happens: at drop-off if nothing needed inspecting, after inspection if something did. The Campaign base is simply the order total.

The failure this makes structurally impossible, rather than merely guards against:

> Two Items, one Order. Deep clean 150k plus a Repair guessed at 200k. Gross 350k clears a "20% off, min order 250k" Campaign, and its Voucher code is claimed — bearer, single-use, atomic ([ADR-0015](0015-campaign-usage-limit-and-vouchers.md)). Inspection then puts the Repair at 80k. Gross is 230k; the Campaign should never have applied. The code is already spent, and it is money.

Any design that claims a discount against a **guess** has to defend against this state. Settling only once every line is priced means the eligibility check never reads an invented number: a blank line bounces a promo outright, because the base is not knowable until the workshop has opened the Item. The state is not handled; it cannot occur.

## What "at payment" got wrong

The first version of this ADR gated discounts on **payment** rather than on being fully priced, on the reasoning that payment is the moment every number freezes. That is true but too strong — it conflates two conditions, and the shop's most ordinary transaction falls in the gap:

> A customer sends a driver to drop off the items. The driver carries no money; the customer will pay at pickup. The customer expects the promo they were told about.

Under a payment gate the cashier prints a Receipt showing the **gross** total and tells the driver the discount comes at pickup. The customer then holds a printed document saying one number and a second-hand verbal promise saying another — and the paper wins every argument. Honouring the promo at pickup means the claim ticket in their hand was wrong, so either the shop reprints the ticket the customer is holding, or two documents disagree about the same Order. Neither is defensible at the counter, and "trust the cashier" is not a discount policy.

What the guess-failure above actually requires is that **no price can still move**. Payment guarantees that, but it is not the only thing that does, and it arrives too late: being fully priced is the real requirement, and it is available at drop-off for the overwhelming majority of Orders, which carry no Repair at all.

Payment was, however, quietly doing a second job: because it froze prices at the same instant it settled the promo, nothing downstream could invalidate the promo's eligibility. Settling earlier gives that up, so the minimum has to be defended explicitly — see the void rule below.

## Considered options

- **Priced-or-blank line, discounts settled once fully priced (chosen).**
- **Priced-or-blank line, discounts settled at payment.** Rejected for the driver case above: it prints a Receipt the shop intends not to honour.
- **Firm-vs-Estimate line modes with a confirmation step.** The cashier types a price at intake and marks it firm (payable now, the shop absorbs inspection surprises) or an Estimate (provisional, blocking payment until confirmed after inspection). Rejected: it forces the cashier to invent a number for a job whose whole premise is that the number is not knowable yet, and then pick a mode for that invented number — the invented number, not the toggle, is the source of counter confusion. And because a claimed discount had to survive a moving price, the Campaign base had to exclude every no-list-price line, *firm ones included* — a rule (a firm 900k repair does not count toward a 250k minimum) that no one could explain to a customer. The owner explicitly wants repair spend to count.
- **Re-evaluate Campaigns whenever a price changes.** Rejected as the general rule: re-resolving a discount means un-claiming and re-claiming bearer Voucher codes and usage-limit slots on every keystroke, and it can silently move a number the customer is holding on paper. The chosen model re-checks **eligibility** on the paths that can break it and voids outright, which needs the release path but not the re-resolve.
- **Don't create the Order until the price is agreed over WhatsApp.** Rejected, and this is the reasoning worth keeping. `item_code` (the physical tag), the drop-off photo ([ADR-0012](0012-photo-precedes-processing.md)), and the Receipt-as-claim-ticket ([ADR-0016](0016-receipt-is-claim-ticket.md)) all derive from the Order. Deferring Order creation would leave a customer's item sitting in the shop with no tag, no photo, no claim ticket, and no record — on exactly the highest-value, highest-dispute-risk service. That state does not disappear when you stop modelling it; it regrows as a paper logbook or a WhatsApp thread on one cashier's phone.
- **Encode "not yet priced" as `price = 0`.** Rejected: zero already means *deliberately free* — that is what a Rework line is ([ADR-0013](0013-complaint-and-rework-line.md)). Conflating the two makes them indistinguishable in every report, refund calculation, and receipt.

## Decisions

- **Repair is one Service with no list price.** `services.price` is nullable. Splitting Repair into narrower catalog rows would not remove the variance — it lives *inside* the job type, not between job types.
- **One nullable price per line.** `orders_services.price` NULL = not yet determined. No `estimated_price`, no `estimate_confirmed_at`, no firm/estimate flag, no confirm endpoint.
- **The Order is always created at drop-off** — tag, drop-off photo, receipt, claim ticket, queue row — whether or not any price is known.
- **A blank price is filled in later**, after inspection, typically agreed with the customer over WhatsApp. A price may also be **corrected** while the Order is unpaid — typos happen. Every set-or-correct is logged with the acting user (`order_service_price_logs`). Payment freezes prices.
- **Payment gate: an Order with any non-cancelled unpriced line cannot be marked paid.** The counter rule is one sentence: *no price, no payment*. Server-side, on the paid transition.
- **Discount gate: an Order with any non-cancelled unpriced line cannot carry a discount.** Campaigns, voucher codes, and hand-keyed discounts all bounce while a line is blank. No line is carved out of the base.
- **A discount settles once, and attaching is claiming.** When the last blank fills, eligibility and minimums are checked against the order total and the Voucher code / usage-limit slot is claimed then and there ([ADR-0015](0015-campaign-usage-limit-and-vouchers.md)) — not deferred to payment. The settled amount is stored on the Order; collecting payment does not re-resolve it, it collects the printed total.
- **A cancellation or downward correction that drops the billable total below an attached Campaign's minimum voids every promo on the Order.** Unpaid Orders only — money that has moved was earned against the printed total. Voiding releases the redemptions, detaches the campaigns, and zeroes `discount`/`discount_source`; the cashier re-applies what still qualifies, which re-checks every rule on the way back in. **All** promos go, not only the one whose bar was breached: recomputing a stacked discount around a hole is a money bug, and the Receipt is being reprinted regardless.
- **The trigger is the minimum alone — the cancel reason is irrelevant.** A shop-caused cancellation (we damaged an Item at intake) strips the printed discount exactly as a customer-caused one does. Owner's explicit call: the alternative is a discount the shop cannot justify against the remaining bill, and goodwill on a damaged Item is a separate conversation, not a silently retained promo.
- **BOGO stays exclusive: a no-list-price line cannot be selected as a buy-one-get-one free slot.** Deliberate owner decision — a misconfigured Campaign must not give away a repair. This exclusion is different in kind from the base carve-out the chosen model does without: it keys on catalog configuration (the Service has no list price), not on a number that might move.

## Consequences

- **A settled discount needs a release path, and every total-lowering path on an unpaid Order must call it.** Two today: cancelling a line, and correcting a price downward. This is the machinery the payment gate would have avoided, and it is the price of a Receipt the shop can honour. A third such path added later without this call reopens the hole — a fixed-amount promo ("100k off, min 250k") on an Order shrunk to 160k hands back most of what is left to pay.
- **The customer's drop-off Receipt shows the discount** whenever the Order was fully priced at intake — which is most Orders. It shows a gross total only when something still needs inspecting, and then the reason is concrete and sayable: *this line has no price yet*. Consistent with [ADR-0016](0016-receipt-is-claim-ticket.md): the Receipt is a claim ticket first and a total second.
- **An Order with a blank line still prints a gross Receipt, and the promo is applied later** — the driver case is not solved for Repair Orders, only for the ordinary ones. Accepted: the discount genuinely cannot be computed against a price nobody knows, and here the cashier has a real explanation rather than a bare promise.
- **An upward price correction does not increase a settled discount.** A 20%-off promo settled at 360k stays at 72k off even if a line is later corrected up to 500k. The customer holds a Receipt naming 72k; the discount amount is settled, and only its *validity* is re-checked. Staff re-key the promo if the customer should get the larger number.
- **Campaign usage slots are consumed at drop-off, not at payment,** so an Order that never pays holds its slot until it is cancelled. Full cancellation releases it ([ADR-0015](0015-campaign-usage-limit-and-vouchers.md)); cancel is unpaid-only ([ADR-0008](0008-cancel-is-unpaid-per-line-refund-twin.md)). An abandoned, never-cancelled Order sits on a slot indefinitely — visible in the campaign's redeemed count, not silently lost.
- **A quoted-vs-final variance report is not buildable** — there is no intake guess to compare a final price against, so "which cashier quotes badly" is not measurable. The price log still records *who* set each price, so favouritism remains auditable. Accepted cost, not an oversight.
- Schema (`services.price` and `orders_services.price` dropping NOT NULL, `order_service_price_logs`) is applied to dev only and must reach prod via `push:prod` before the next deploy — see `TODO.md`.
