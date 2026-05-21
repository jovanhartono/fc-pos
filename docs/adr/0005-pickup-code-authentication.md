# Pickup code authentication

The picked-up transition on an OrderService is gated by a 6-digit `orders.pickup_code` that the Customer presents to the cashier in person.

## Flow

1. Order is inserted. A PostgreSQL DB-side default expression on `orders.pickup_code` generates 6 digits at insert time: `lpad(floor(random() * 1000000)::text, 6, '0')`. The server does not explicitly generate the code.
2. While the Order is not yet `ready_for_pickup`, the code is **not** exposed on the public `/track` page.
3. When the Order rolls up to `ready_for_pickup`, `/track` reveals the code to the Customer (after their `code + phone_number` match).
4. Customer reads the code to the cashier in person.
5. Cashier opens the specific Order in the pickup dialog and enters the code. Server validates `pickup_code` matches **this Order** before recording the OrderPickupEvent and transitioning the relevant OrderServices to `picked_up`.

## Why a code, not QR / signature / nothing

- Items are physical (footwear). Mis-handover risk is real and irreversible.
- A short numeric code is verbally handover-friendly (no phone/camera required at the counter, works across customers with cracked screens or no app).
- Generated at insert so the customer cannot derive or pre-guess it.

The code is **per-Order verification**, not cross-Order discovery — the cashier has already opened the specific Order (by scanning the order code or selecting from a list). The pickup code's job is to prove the customer in front of the cashier is the one who placed the Order; it does not disambiguate between Orders.

## Current schema constraint

The schema has one CHECK on `orders_services` (`schema.ts:574-577`):

```sql
CHECK (pickup_event_id IS NULL OR status IN ('picked_up', 'refunded'))
```

Read: *if `pickup_event_id` is set, status must be `picked_up` or `refunded`*. One direction.

The reverse direction — *if status is `picked_up`, `pickup_event_id` must be set* — is **NOT enforced by the schema**. Today only the service-layer code path (`order-admin.service.ts` pickup handler) guarantees the invariant.

## Considered and declined

Two changes were on the table during ADR drafting and **deliberately declined** after walking the threat model. They are recorded here so future explorers see the trade-off, not as open gaps to revisit.

### Declined: app-level generation (CSPRNG)

Original proposal: move generation from DB-level `random()` into `order.service.ts createOrder` as `crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")`, drop the DB default, inject a deterministic generator in tests.

Declined because the CSPRNG-vs-PRNG distinction does not matter for this attack model:

- The "attack" is *random walk-in guesses 6 digits and walks out with someone's shoes* — probability 1/10⁶ regardless of generator quality.
- An attacker would need to observe a long sequence of consecutive codes to exploit `random()`'s predictability. No such sequence is exposed — `/track` is gated by `code + phone_number` match, and the customer only ever sees their own code.
- Testability gain is trivial — the only assertion worth writing is `/^\d{6}$/` shape, which needs no injection.

DB default stays. Reading the schema column tells the whole story in one line.

### Declined: UNIQUE on `pickup_code`

Original proposal: partial `uniqueIndex` on non-terminal Orders plus retry-on-conflict in the service layer.

Declined because `pickup_code` is **per-Order verification, not cross-Order discovery** (see [CONTEXT.md](../../CONTEXT.md) "Pickup code"). The cashier has already opened a specific Order before entering the code; the server checks the code against **that Order's row only**, never across the table. A duplicate code on another Order is invisible to this validation path.

Birthday math at expected scale:

- ~30 active Orders per store at peak; pickup is single-store-scoped.
- P(any two active Orders in one store share a code) ≈ C(30,2) / 10⁶ ≈ 0.04% at any moment.
- A wrong-handover would additionally require the cashier to misclick the wrong Order **and** the customer in front of them to read out a code that coincidentally matches the wrong row. Two independent errors must coincide.

Estimated wrong-handovers from this path: very low single digits per year worst case. The partial-UNIQUE index would close the path, but the cost (write amplification on every Order insert, a migration over live data) buys protection against a multi-event coincidence the current per-Order check already substantially mitigates.

Accepted residual risk: cashier may, in rare birthday-collision cases combined with row-misclick, complete pickup against the wrong Order. Mitigated operationally (cashier confirms customer name on dialog) rather than schema-enforced.

## Outstanding fix

One gap from the original drafting **remains real** and is independent of the two declined items:

### Missing CHECK implication

The schema currently enforces *if `pickup_event_id` is set, status must be `picked_up`/`refunded`*, but **not** the reverse — *if status is `picked_up`, `pickup_event_id` must be set*. A row claiming pickup happened without the dialog flow is therefore allowed by the database; only application code prevents it today.

Target combined constraint:

```sql
CHECK (
  (pickup_event_id IS NULL OR status IN ('picked_up', 'refunded'))
  AND
  (status != 'picked_up' OR pickup_event_id IS NOT NULL)
)
```

This is a data-integrity invariant, not an authentication concern — it belongs in the schema regardless of how the code is generated or whether it is UNIQUE. Fix on its own; no coupling to the declined items.

## Consequences

- The picked-up transition must never be settable via a generic status dropdown — only through the pickup dialog. Today this is an **application-layer invariant**, not a schema-enforced one (see gap 3).
- `pickup_code` must never leak to admin/cashier UI for Orders not yet `ready_for_pickup` (would let an internal actor bypass the customer-presence check).
- The public `/track` page is the only surface that exposes the code, and only after the status check.
- Replacing the scheme later (e.g. with QR) means deprecating the dialog input path and migrating the generation column, not editing application code alone.
