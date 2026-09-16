# Customer detail is admin-only and always all-store

The customer detail page shows one Customer's Orders, **Lifetime spend**, last visit, and complaint count. It is gated with `assertIsAdmin` and always reports across every Store, never the viewer's own.

Two things forced this. First, a phone number is global identity — one Customer, one row, whatever store they walked into — so a Lifetime spend scoped to the viewer's Stores would print a different number for the Kemang cashier, the Pondok Indah cashier, and the admin looking at the same person. A money figure whose value depends on who is reading it is worse than no figure. Second, this page is where a thin directory becomes a profile: home address, email, every order at every store, and what the person is worth. `adminMiddleware` is `jwt + is_active` and carries **no role check**, so shipping it on the existing gate would hand all of that to any active account — including a Courier, whose entire reason to log in is attendance ([ADR-0010](0010-courier-role-login-only-excluded-by-allowlist.md)). Money is already admin-gated at the refund flow ([ADR-0004](0004-role-capabilities-v1.md)); this puts the lifetime money picture behind the same door.

## Considered options

- **Any staff, own Stores only** — rejected for the split-figure problem above. It also reads as a privacy control while leaking the same PII to the same people.
- **Any staff, all Stores** — what today's middleware would give for free. Rejected: it widens PII exposure to roles that have no use for it.
- **Admin + cashier** — defensible if the page were a counter lookup, but it is a management profile (orders, spend, last visit). A cashier serving someone at the counter opens the Order, not the person.

## Consequences

The POS **Customer lookup** (`GET /admin/customers/lookup`) stays open to all staff and must not be narrowed — checkout depends on it, and it returns a name, never money or history. The browse list `GET /admin/customers` is likewise untouched here. This ADR covers the detail read only; the missing role checks elsewhere on the admin surface are a separate, already-tracked concern.

Numbered 0021 because 0020 is taken by unmerged work on `feat/shift-clock-in-location`.
