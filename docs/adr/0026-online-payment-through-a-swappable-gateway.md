# Online payment goes through one gateway seam, Midtrans or DOKU, chosen by env

Customers can now pay an Order three ways without a cashier ticking "Mark as paid": a QRIS the cashier shows at the counter, the WhatsApp ready notice carrying the Track page, and a Pay button on the Track page. There is no separate "send payment link" message: an Order not yet ready is paid at the counter or from a Track link the Customer already has. Each try is a Gateway charge. The Order becomes paid only when the gateway's webhook (or a status check) confirms the money, through the same guarded update the cashier's button uses, so a duplicate notice cannot book the money twice.

The shop runs on an individual (perorangan) merchant account, so the gateway has to be swappable: Midtrans and DOKU sit behind one interface (`modules/payments/gateways/types.ts`) and `PAYMENT_GATEWAY` picks the one new charges use. Both webhook routes stay open after a switch, so a late notice from the old gateway still lands.

**Why WhatsApp carries the Track page, not a gateway link:** a gateway link expires (Snap after 24 hours) and the Customer may open the message days later. The Track page makes a fresh checkout on each Pay, so the link never dies, and the WhatsApp text is the same whichever gateway is live.

**Why DOKU's counter QRIS is DOKU's own page:** DOKU's direct QRIS API needs an RSA key pair plus a merchant and terminal ID from a separate QRIS registration, and several details are not confirmed in its docs. DOKU Checkout limited to QRIS needs only the Client ID and secret and can be tested in sandbox today. Midtrans returns a QR image we show in the dialog.

**Why one PaymentMethod per gateway:** the Day close checks money against settlement slips. Gateway money settles through the gateway's own report, not a card terminal, so it gets its own line. An admin links one PaymentMethod to each gateway; charging is refused until that link exists and is active. Mark as paid and POS checkout never offer that PaymentMethod, so it only ever carries money the gateway confirmed.

**Why a charge can end in "needs review":** the money is already taken when a notice arrives. If the Order was meanwhile paid in cash, cancelled, or its total changed, or a Voucher in the charge was spent elsewhere, the Order is left alone and the charge is flagged for an admin to refund by hand from the gateway's dashboard. Voucher claims happen only when the money arrives, never when the QR is shown.

## Considered options

- **Send the gateway's payment link in WhatsApp.** Rejected: it expires, and it differs per gateway.
- **Map gateway money onto the existing QRIS and Transfer rows.** Rejected: it mixes gateway money with terminal money in the Day close.
- **Automate refunds through the gateway.** Not now: refunds stay bookkeeping (ADR-0007) and the money goes back by hand.

## Consequences

- `payment_charges` holds one row per try, keyed by our own reference (`FC-<order id>-<random>`), because the Order code has `#` and `/` that neither gateway accepts.
- `paid_by` is the cashier who made the charge, or empty when the Customer paid on the Track page; the Order shows "Paid online".
- Each gateway dashboard needs its notification URL set to `https://pos.fresclean.id/api/webhooks/payments/<gateway>`; Midtrans also receives it per charge.
- Midtrans' counter QRIS uses the Core API, which needs a separate production activation request.
