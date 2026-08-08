# Campaign minimum excludes Repair lines

A Campaign carries a minimum order total, checked at checkout against the whole cart's gross total. Once **Repair** lines can be re-priced after checkout ([ADR-0018](0018-estimate-blocks-payment.md)), that check is evaluated against a number that has not settled yet — and the discount it authorised has already been claimed. We decided that both the Campaign's **eligibility base** and its **minimum-total base** are computed from **fixed-price lines only**. Repair contributes to neither.

The failure this prevents:

> Two Items, one Order. Deep clean 150k (eligible) plus an estimated Repair at 200k. Gross 350k clears a "20% off, min order 250k" Campaign, and its Voucher code is claimed — atomically, single-use, released only on full cancellation ([ADR-0015](0015-campaign-usage-limit-and-vouchers.md)). Inspection then puts the Repair at 80k. Gross is 230k; the Campaign should never have applied. The code is already spent, and it is bearer — it is money.

## Considered options

- **Compute the Campaign entirely from fixed-price lines (chosen).** The discount then depends on nothing that can move after checkout, so re-pricing can never invalidate it.
- **Re-evaluate Campaigns whenever a line is re-priced.** Rejected: it requires un-claiming and re-claiming Voucher codes and usage-limit slots, and it can strip a discount from a customer who already saw it on their receipt. Correctness bought at a price nobody wants to pay.
- **Make Orders containing a Repair line wholly Campaign-ineligible.** Rejected: a customer dropping four Items should not lose the promotion on the other three because one needs a repair. This was the shop's explicit instinct and it is right.
- **Exclude Repair from eligibility but leave it in the minimum-total base.** Rejected as a half-measure — it is the version that still exhibits the failure above. Excluding a line from receiving a discount does not stop it from *unlocking* one.

## Decisions

- **Eligibility:** Repair is absent from every Campaign's eligible-service list, so `stackCampaignDiscounts` already skips it. No engine change — this is catalog configuration.
- **Minimum-total base:** the gross total fed to `campaignIneligibilityReason` and `resolveDiscount` is the **fixed-price subtotal**, not the cart total. This is the actual code change, in `useCheckoutPricing` (client preview) and `order.service.ts` (server truth). The two must agree or the POS previews a discount checkout then rejects.
- **The rule keys on the Service having no list price, not on the line being an Estimate.** A firm-priced Repair is excluded too. Otherwise the same Repair would swing a Campaign in or out depending on how confident the cashier felt, which is not a pricing rule anyone can explain to a customer.

## Consequences

- **Repair spend does not help a customer reach a promotion threshold.** A 900k repair plus a 50k deep clean does not clear a 250k minimum. This is intentional — Repair is quoted work, not catalogue spend — but it is the kind of thing a customer will ask about at the counter, so staff should know the answer.
- Campaign discounts on an Order are fully determined at checkout and never move afterwards, which keeps [ADR-0015](0015-campaign-usage-limit-and-vouchers.md)'s claim-once-release-on-full-cancellation guarantee intact without any new release path.
- **Gross sales for a Repair line is the price actually charged**, since there is no list price to report against. The Revenue-versus-Gross-sales gap therefore stays exactly "discounts plus refunds" — the identity the reports rely on — rather than silently absorbing quoted-work variance.
