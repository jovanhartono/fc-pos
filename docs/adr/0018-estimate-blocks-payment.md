# An unconfirmed Estimate blocks payment

**Repair** — replacing leather, panels, or structure on an Item — has no list price. What it costs depends on how much has to be replaced, and that is only knowable after inspection. Every other Service reads its price from the catalog and the browser cannot touch it; Repair cannot work that way. We decided to separate two questions that look like one:

- **Catalog:** does this Service have a list price? Repair never does.
- **Line:** is *this* number final? The cashier decides, per line, at intake.

A cashier confident in the number enters it as **firm** and the Order behaves like any other — payable at drop-off. A cashier who is not enters an **Estimate**, and **an Order carrying any unconfirmed Estimate cannot be marked paid**.

## Considered options

- **Firm-vs-Estimate as a line property, payment gated on it (chosen).**
- **Every Repair line forces the Order unpaid until pickup.** Rejected: it punishes the trained cashier who genuinely knows the price, and delays cash the shop could collect at the counter on the majority of repairs.
- **Split into two Orders — one paid for the known lines, one unpaid for the Repair.** Rejected. It is the escape hatch [ADR-0001](0001-payment-is-binary.md) suggests for split payment, but here it separates treatments applied to *the same physical object* across two Orders, with two receipts and two pickup codes. Worse than the problem.
- **Partial payment on one Order.** Rejected — reopens [ADR-0001](0001-payment-is-binary.md). Payment is binary and we are not changing that for this.
- **Store one price and overwrite it on confirmation.** Rejected: it destroys the only evidence of how good the shop's estimates are, which is the question that motivated the split in the first place.

## Decisions

- **Both numbers are kept** — what was entered at intake, and what it finally was. Overwriting makes estimate accuracy permanently unmeasurable.
- **Firm is a commitment.** If inspection says 400k on a firm 200k line that is already paid, the shop absorbs it — payment is binary, there is no top-up. The only alternative is cancelling and re-keying the whole Order. This is deliberate: it is the brake that stops cashiers declaring firm when they are guessing.
- **Confirming an Estimate is open to any staff, and logged.** Deliberately *not* behind the admin money gate ([ADR-0004](0004-role-capabilities-v1.md)). Money still moves only through the POS, so the exposure is favouritism, not shrinkage; and gating something that happens on every Repair would jam the counter. Oversight is the variance report — estimate versus final, by user — which catches a pattern where per-order approval would only add friction.
- **The gate is server-side**, on the paid transition: any line still an unconfirmed Estimate refuses the Order's move to `paid`.
- **Zero is not the marker.** `price = 0` already means *deliberately free* — that is what a Rework line is ([ADR-0013](0013-complaint-and-rework-line.md)). "Not yet priced" must be encoded separately or the two become indistinguishable in every report, refund calculation, and receipt.

## Consequences

- **A mixed Order waits for all its money.** Deep clean 150k (known) plus an estimated Repair means the 150k is not collectable at drop-off either. Accepted — the alternative is splitting the Order, which is worse.
- The Receipt printed at drop-off for an estimated Order shows a number that may change. It is a claim ticket ([ADR-0016](0016-receipt-is-claim-ticket.md)) first and a total second, but staff should say so out loud.
- **The "call the customer if the final greatly exceeds the estimate" rule is verbal, not enforced** — same posture as the 30-day collection limit and the ~2-day complaint window.
- Estimate accuracy per user becomes reportable, which is how "is this cashier trained enough to quote?" stops being a matter of opinion.
