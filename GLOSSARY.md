# Fresclean

A multi-store shop that cleans, restores and repairs footwear, bags, hats and luggage. A Customer drops Items off at a Store, the shop treats each one, and the Customer collects them.

## Language

### Catalog

**Service**:
A cleaning, restoration or repair treatment offered in the catalog, such as a deep clean or midsole whitening. Shared by every Store.
_Avoid_: Treatment, package

**Repair**:
The one Service with no list price, because what it costs depends on how much of the Item has to be replaced. Its price is agreed per Item after inspection.
_Avoid_: Restoration (the whole kind of work, not this Service), fix, overhaul, Estimate

**Product**:
A physical good sold alongside Services, such as laces or a brush.
_Avoid_: Merchandise, add-on

**Category**:
A grouping of Services and Products that reports break figures down by.

**Active**:
Whether a Service, Product, Category, PaymentMethod, Store, User or Campaign may be used in day-to-day work.
_Avoid_: Enabled, published, visible

### Discounts

**Campaign**:
A discount rule with a date window, a minimum order total, eligible Services and the Stores it runs at. Either listed in the POS or redeemed by code as a Voucher.
_Avoid_: Promo, coupon

**Usable**:
Said of a Campaign whose every rule passes for a given Store, order total and moment, so it may be applied to an Order.
_Avoid_: Available

**Usage limit**:
An optional cap on how many Orders, across every Store, may redeem a listed Campaign.
_Avoid_: Quota, max uses

**Voucher**:
A Campaign redeemed by code rather than picked from a list, issued as a batch of codes handed to specific people.
_Avoid_: Coupon, gift card, promo code

**Voucher code**:
One single-use code belonging to a Voucher, good for whoever presents it.
_Avoid_: Coupon code, redemption key

**Settling**:
The moment an Order's discounts are worked out and its Campaigns claimed: once every Line not cancelled has a price.

### People and places

**Store**:
A physical shop location. Every Order and every Shift belongs to one.
_Avoid_: Branch, outlet

**Customer**:
The person who drops Items off and collects them, identified by their phone number.

**User**:
A staff member who signs in to the console, holding one role: admin, cashier, worker or courier.

**Courier**:
A User who collects Items from Customers and delivers them back, and signs in only to clock in.
_Avoid_: Delivery guy, driver, rider

**Shift**:
A User's attendance at a Store, from clock-in to clock-out. It permits nothing and blocks nothing.

**Password reset**:
An admin setting a new password for another User in person, the only way a password ever changes.
_Avoid_: Forgot password, recovery, reset link

### Orders

**Order**:
One sale to a Customer at a Store, usually a drop-off of Items, from intake to the last pickup. The unit of payment, cancellation and refund.
_Avoid_: Transaction, sale, ticket

**Item**:
One physical object handed over for service, such as a pair of shoes, a bag, a hat or a suitcase. The thing a tag is stuck to and the Customer collects.
_Avoid_: Pair (unless the Item really is one), unit, article, piece

**Item code**:
The code on an Item's tag, naming that one object.

**OrderService**:
One Item receiving one Service, with its own status, handler and price.
_Avoid_: Order item, line item, job (workers' shorthand only)

**OrderProduct**:
One Product line on an Order.

**Line**:
An OrderService or an OrderProduct on an Order.

**Handler**:
The one User currently responsible for an OrderService.

**Priority**:
A mark on an OrderService that moves it up the Queue and changes nothing else.

**Unpriced line**:
An OrderService whose price is not known yet, usually a Repair waiting for inspection. Distinct from a line priced at 0, which is free on purpose.

**Order total**:
The amount due on one Order.

**Payment status**:
Whether an Order is paid in full or unpaid. There is no part payment.

**PaymentMethod**:
How the money for a paid Order arrived, such as cash, transfer or QRIS. An unpaid Order has none.

**Cancellation**:
Taking Lines off an Order before it is paid, chosen Line by Line. No money moves.
_Avoid_: Void (a Line), cancelling the whole Order

**Refund**:
Returning the money for Lines on a paid Order, chosen Line by Line.

**Refund status**:
How much of a paid Order's money has gone back: none, part or all.

**Order status**:
The stage an Order is at: created, processing, ready for pickup, completed or cancelled. Worked out from its lines, never set by hand.

**OrderService status**:
The stage an OrderService is at: queued, processing, quality check, QC reject, ready for pickup or picked up. Or how it ended without being done: cancelled before payment, refunded after.

**Quality check**:
An inspection of an Item before it goes back to the counter, done in shop practice by someone other than the person who cleaned it.

**Collectable**:
Said of an Item still in the shop with no work left on it: every OrderService is ready for pickup, cancelled or refunded, and not all of them are cancelled.

**OrderPickupEvent**:
One handover of Items back to the Customer. An Order can have several.

**Pickup code**:
The six-digit code, printed on the Receipt and shown on the tracking page, that the person collecting gives to prove the Order is theirs.

**Receipt**:
The printed claim ticket handed to the Customer at drop-off, carrying the Order code, the Pickup code and a link to follow the Order.
_Avoid_: Invoice, nota, bill

**Collection limit**:
The shop's verbal rule that Items left uncollected for about 30 days are no longer its responsibility. Printed on the Receipt; never tracked.

### Complaints

**Complaint**:
A Customer's accepted grievance about a finished OrderService, covering every attempt to put it right.
_Avoid_: Ticket, case, dispute

**Rework line**:
A free OrderService added to the same Order to re-clean a complained Item.
_Avoid_: Redo, rework order, re-clean ticket

**Complaint outcome**:
Where a Complaint ended up: pending, reworked, refunded or cancelled.

**Complaint rate**:
The share of OrderServices that drew a Complaint, Rework lines left out.

**Goodwill voucher**:
A favour staff give an unhappy Customer outside the system. Not a Voucher.

### Photos

**Drop-off photo**:
The one photo per Order taken at the counter at intake, proving who handed over what.

**Item photo**:
A photo of an Item's condition before the shop works on it. An Item can have many, shared by all of its Services.
_Avoid_: Service detail photo, service photo, before/after photo

**Pickup photo**:
The photo taken at each OrderPickupEvent, proving the Items left with the Customer.

### Reports

**Revenue**:
What the shop kept: money collected on paid Orders, minus refunds.
_Avoid_: Net revenue, turnover, total

**Gross sales**:
The value of what was sold at the prices on its Lines, before discounts and refunds.
_Avoid_: Gross revenue, sales, total

**Collected**:
Money taken on paid Orders after discounts, before refunds.
_Avoid_: Revenue, total

**Lifetime spend**:
What one Customer has paid across all of their Orders, minus refunds.
_Avoid_: Total spend, customer revenue, lifetime value, LTV, total

**Services processed**:
The number of OrderServices that reached quality check for the first time.
_Avoid_: Items processed, items completed

### Screens

**POS**:
The screen on the store tablet where staff create Orders.
_Avoid_: Transactions (the screen's legacy route and folder name only), till

**Cart**:
The draft a staff member builds in the POS. It becomes an Order only at checkout.

**Queue**:
The list of OrderServices waiting for work at a Store, priority first and then oldest first.

**Aging queue**:
A report listing every OrderService not yet picked up, cancelled or refunded, oldest first.
