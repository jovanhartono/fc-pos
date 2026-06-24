# POS creates the Customer atomically with the Order (find-or-create by phone)

Most POS walk-ins are **new** Customers. The old flow forced the cashier out of checkout into a full Customer sheet (name/phone/email/address/store), submit, close, then back — a heavy detour for the common case — while a searchable-select gave returning Customers a fiddly second path. We collapsed both into **two always-visible fields, Phone and Name**: the cashier enters the phone, a debounced exact lookup prefills the name if that phone already exists (returning) or leaves it blank to type (new). On checkout the POS **always** sends `customer: { name, phone_number }` — never a resolved id — and the server **find-or-creates the Customer by phone inside the Order transaction**. A Customer thus comes into existence exactly when their first Order does, never orphaned. `phone_number` is `UNIQUE` (see [CONTEXT.md](../../CONTEXT.md) → Customer), so phone *is* identity and find-or-create is deterministic.

## Considered options

- **Two always-on fields + server find-or-create, payload is always `customer{name,phone}` (chosen).** No select, no combobox, no returning/new toggle. The phone field's lookup is pure UX (confirm identity, skip re-typing a regular's name); correctness comes entirely from the server resolving `findByPhone ?? insert` within the transaction `createOrder` already opens. Since the POS is the only `createOrder` caller and always has name+phone in hand, a `customer_id` arm has no purpose — dropped.
- **`customer_id` XOR `customer{name,phone}`.** Considered first. Rejected as over-built: the POS never holds a bare id to send (it holds what the cashier typed), so the id arm is dead weight. Server find-or-create makes sending the resolved id a pointless optimisation (one indexed lookup saved) at the cost of a client branch.
- **Eager client-side create on an "Add" tap.** Rejected — most surgical (no contract change) but every abandoned checkout after the tap leaves a permanent Customer row, and a mistyped name persists silently. Orphan accumulation in a busy POS is the dealbreaker; `UNIQUE` phone only dedups *re-entry*, not abandonment.
- **Client two-call orchestration at submit (create Customer, then Order).** Rejected — non-atomic: Customer created then Order fails leaves an orphan, and the retry collides on the `UNIQUE` phone and must be taught to reuse. That is the server's find-or-create, run client-side without a transaction. Strictly worse.

## Decisions

- **`POSTOrderSchema` carries `customer: { name, phone_number }` (required); no `customer_id`.** This changes the **shared contract** (`@/schema`, re-exported as `@fresclean/api/schema`) — both packages rebuild via tsdown.
- **Resolution is `(await findCustomerByPhone(tx, phone))?.id ?? insertCustomer(tx, …)`,** run inside the Order transaction before `insertOrder`. A phone hit **silently reuses** the existing Customer — phone is identity, so "checkout with a phone that already exists" means "this is that Customer," not an error.
- **Customer names are stored Title Case, at the shared server insert boundary.** Applied where Customers are created — both this checkout path *and* the standalone Customer sheet — so casing is consistent everywhere, not just at the POS. `toTitleCase("budi santoso") → "Budi Santoso"`. Name is not part of the dedup key, so casing never affects find-or-create.
- **find-or-create is create-or-attach, never update.** If a returning Customer's submitted name differs from the stored one, the stored record wins and the difference is ignored. The client mitigates by prefilling the name from the lookup and rendering it **read-only** once a phone matches — editing Customer details stays a separate path, not a checkout side effect.
- **A new Customer's `origin_store_id` defaults to the Order's Store, server-side.** The cashier never sets it; the checkout Store is the origin by definition. Email/address are left null for POS-created Customers (both optional).
- **Phone is normalized client-side (`normalizePhoneNumber`) before the lookup and before send;** the server trusts that format. The `UNIQUE` dedup is only correct while both sides agree on normalization — do not bypass it.
- **The checkout draft holds `customerName` + `customerPhone`** (replacing `selectedCustomerId`). The cart→payment gate is `validPhone && name`, not a resolved id.

## Consequences

- The contract change ships via tsdown rebuild of `@fresclean/api`; web must rebuild types before it type-checks against the new payload.
- New-Customer validation (name required, phone format) surfaces as a server `400` at Order submit. The client validates the draft up front so the error path is rare, but the server is the boundary of record.
- There is no longer any way for the POS to mint a Customer without an Order. Standalone Customer creation (the Customer sheet) still exists for admin use; this ADR governs the **checkout** path only.
- `CustomerAutocomplete` loses its only caller (POS checkout) and is removed.
- A returning Customer who supplies a *new* phone number is treated as a new Customer (new record) — correct under phone-as-identity. Merging mistaken duplicates is out of scope.
