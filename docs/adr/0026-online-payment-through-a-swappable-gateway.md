# Online payment goes through one gateway seam, Midtrans or DOKU, chosen by env

Customers can now pay an Order three ways without a cashier ticking "Mark as paid": a QRIS the cashier shows at the counter, the WhatsApp ready notice carrying the Track page, and a Pay with QRIS button on the Track page. There is no separate "send payment link" message: an Order not yet ready is paid at the counter or from a Track link the Customer already has. Each try is a Gateway charge. The Order becomes paid only when the gateway's webhook (or a status check) confirms the money, through the same guarded update the cashier's button uses, so a duplicate notice cannot book the money twice.

The shop runs on an individual (perorangan) merchant account, so the gateway has to be swappable: Midtrans and DOKU sit behind one interface (`modules/payments/gateways/types.ts`) and `PAYMENT_GATEWAY` picks the one new charges use. Both webhook routes stay open after a switch, so a late notice from the old gateway still lands.

**Why WhatsApp carries the Track page, not a gateway link:** a gateway link expires (Snap after 24 hours) and the Customer may open the message days later. The Track page makes a fresh QRIS on Pay, so the link never dies, and the WhatsApp text is the same whichever gateway is live.

**Why the Track page shows the QR itself:** the counter and the Track page make the same QRIS charge; the Track page's is told apart by having no cashier. The QR stays on the page through a reload until it expires, and Save QRIS gives the Customer a PNG to pick in their bank app, since a phone can't scan its own screen. DOKU's own page offered VA and e-wallets too, which the Day close couldn't tell apart (below).

**Why DOKU's QRIS has two paths:** the QR should sit in the dialog and on the Track page, as Midtrans gives it, so DOKU's SNAP QRIS API draws it there. That API needs an RSA key pair plus a merchant and terminal ID from DOKU's QRIS registration. Until those four values are set, QRIS opens DOKU Checkout limited to QRIS, which needs only the Client ID and secret. DOKU documents no notification for SNAP QRIS, so its charges settle through the status check the dialog and the Track page poll while the QR is up.

**Why one PaymentMethod per gateway:** the Day close checks money against settlement slips. Gateway money settles through the gateway's own report, not a card terminal, so it gets its own line. An admin links one PaymentMethod to each gateway; charging is refused until that link exists and is active. Mark as paid and POS checkout never offer that PaymentMethod, so it only ever carries money the gateway confirmed.

**Why every gateway payment is QRIS for now:** one PaymentMethod per gateway can't tell QRIS from a VA or a card on the Day close, so both gateways' pages offer QRIS only and the PaymentMethod is named for it ("QRIS · DOKU"). The day a second channel is added, the PaymentMethod gains a channel (one per gateway + channel), existing ones backfill to QRIS, and a Payment takes the PaymentMethod of the channel the Customer actually paid with.

**Why a charge can end in "needs review":** the money is already taken when a notice arrives. If the Order was meanwhile paid in cash, cancelled, or its total changed, or a Voucher in the charge was spent elsewhere, the Order is left alone and the charge is flagged for an admin to refund by hand from the gateway's dashboard. Voucher claims happen only when the money arrives, never when the QR is shown.

## Considered options

- **Send the gateway's payment link in WhatsApp.** Rejected: it expires, and it differs per gateway.
- **Map gateway money onto the existing QRIS and Transfer rows.** Rejected: it mixes gateway money with terminal money in the Day close.
- **Automate refunds through the gateway.** Not now: refunds stay bookkeeping (ADR-0007) and the money goes back by hand.

## Consequences

- `payment_charges` holds one row per try, keyed by our own reference: the Order code without `#` and with `/` as `-`, plus a 4-character tag per try (`KMG-04112026-2-x7k2`). Neither gateway accepts `#` or `/`, and each refuses a reference twice; the code part lets an admin find the Order in the gateway's dashboard.
- `paid_by` is the cashier who made the charge, or empty when the Customer paid on the Track page; the Order shows "Paid online".
- Each gateway dashboard needs its notification URL set to `https://pos.fresclean.id/api/webhooks/payments/<gateway>`; Midtrans also receives it per charge.
- Midtrans' counter QRIS uses the Core API, which needs a separate production activation request.
