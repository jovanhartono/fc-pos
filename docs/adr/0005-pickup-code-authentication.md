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

## Known hardening gaps (must fix before v1 ship)

These are recorded as deferred-fix items, not as deliberate design:

1. **Generation must move from DB-level `random()` to application-level `crypto.randomInt`.** The current `lpad(floor(random() * 1000000)::text, 6, '0')` DB default is a PRNG, not a CSPRNG. Move generation into `order.service.ts createOrder`: `crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")`. Drop the DB default; column stays `NOT NULL`. Generation and retry-on-conflict (see gap 2) belong in one place. Tests can inject a deterministic generator.
2. **Add partial UNIQUE on non-terminal Orders + retry-on-conflict in service.** Index: `uniqueIndex("orders_pickup_code_uidx").on(table.pickup_code).where(sql\`status NOT IN ('completed','cancelled')\`)`. Service catches `23505` unique-violation, regenerates, retries. Rationale for *partial*: a `pickup_code` is only meaningful while the Order is active — once terminal, the code is dead weight and global UNIQUE-forever would accumulate collisions unnecessarily across ~30k orders/yr × 5yr against a 10⁶ codespace. Partial UNIQUE keeps the invariant where it matters (no two active Orders share a code) without forcing historical uniqueness.
3. **Add missing CHECK implication.** Current constraint allows `status='picked_up'` with `pickup_event_id IS NULL` — a row that claims pickup happened without the dialog flow. Add a second CHECK so schema enforces `status='picked_up' → pickup_event_id IS NOT NULL`. The dialog-only invariant then lives in the database, not just in application code. Combined target:

   ```sql
   CHECK (
     (pickup_event_id IS NULL OR status IN ('picked_up', 'refunded'))
     AND
     (status != 'picked_up' OR pickup_event_id IS NOT NULL)
   )
   ```

When all three land, the ADR can be updated to record the post-hardening design instead of the current state + gaps.

## Consequences

- The picked-up transition must never be settable via a generic status dropdown — only through the pickup dialog. Today this is an **application-layer invariant**, not a schema-enforced one (see gap 3).
- `pickup_code` must never leak to admin/cashier UI for Orders not yet `ready_for_pickup` (would let an internal actor bypass the customer-presence check).
- The public `/track` page is the only surface that exposes the code, and only after the status check.
- Replacing the scheme later (e.g. with QR) means deprecating the dialog input path and migrating the generation column, not editing application code alone.
