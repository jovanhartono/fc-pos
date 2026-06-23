# Courier role: login-only, excluded by allowlist, no per-order delivery state

Couriers collect dropped-off items from the customer at intake and deliver finished items back after pickup. They log in **only** to open a Shift (attendance) — they do not run the POS, the queue, or money. The operator asked for two things: (1) couriers must not pollute the **worker-productivity report**, and (2) each Order should record **which courier collected it** for accountability (lost-shoe disputes) and delivery-volume reporting. We decided to model couriers as a new **`courier`** `User` role and to add a single nullable **`orders.collected_by`** FK — and deliberately **not** to build a delivery lifecycle, a courier entity, or processing-axis gates.

## Considered options

- **New `courier` role + `orders.collected_by` FK (chosen).** Couriers are Users (they already need logins for Shifts), distinguished by role. The per-Order courier is a nullable FK to a `role=courier` User; its presence is the delivery marker.
- **Reuse `worker` for couriers.** Rejected — then "which Users are couriers" is unanswerable by role, so the create-time picker can't filter and reports can't separate courier shifts from processing shifts. It also re-includes couriers in the worker-productivity report (see below).
- **Standalone `couriers` table instead of a role.** Rejected once we learned couriers log in and clock Shifts — that makes them Users, and a parallel entity would duplicate identity/auth.
- **A boolean `is_delivery` + free-text courier name.** Rejected — free text breaks accountability (typos) and group-by reporting; a boolean plus a name is two fields encoding what one FK encodes.
- **A delivery lifecycle (create-then-collect, timestamps, state transitions).** Rejected — the operator only ever creates an Order once shoes are physically present (the drop-off photo is required at intake), so collection is already complete at create. There is no pending state to model.

## Decisions

- **`courier` is a fourth `User` role**, alongside `admin` / `cashier` / `worker`. Couriers log in solely to open a Shift.
- **Report exclusion is by allowlist, not denylist.** The worker-productivity report selects `WHERE role = 'worker'` (`report-range.repository.ts` `fetchWorkerUsers`). A `courier` therefore never appears — *no report code changes*. This is the entire mechanism behind requirement (1): migrating the existing courier accounts `worker → courier` is what removes them. Do **not** "fix" this into an explicit `role != 'courier'` exclusion — the allowlist is the design.
- **`orders.collected_by` is a nullable FK → `users.id`.** Non-null marks the Order as collected via delivery; null = walk-in. There is no separate `is_delivery` boolean — the courier reference is the marker.
- **Validation is service-layer:** `collected_by` must reference a User with `role = courier` and `is_active`. It is **not** store-scoped — the two couriers roam across stores, so any active courier is selectable regardless of the Order's Store. (Couriers still carry `userStores` for clocking Shifts; that is independent.)
- **Set at create, editable on the order detail by cashier + admin** (mirrors `assertCanCreateOrder`). A misattributed courier is a corrupt accountability record, so correction is a first-class path, not create-only.
- **Processing axis stays role-open for couriers (no new gates).** Per the [ADR-0004](0004-role-capabilities-v1.md) amendment, self-assign / status updates / detail photos are open to all staff with no assert. A courier *could* claim a queue item; we accept that rather than reverse the gate-free model for a thing couriers won't do. The restricted seams (`assertCanCancelOrderService` allowlists `admin/cashier/worker`; refund is admin-only) already exclude couriers for free.

## Consequences

- The role enum and `orders.collected_by` ship via `push:dev`; both must reach prod via `push:prod` before the next deploy.
- Requirement (1) depends on a **data migration** (flip the existing courier accounts off `worker`), not on code — until those rows are migrated, couriers still appear in the productivity report.
- Couriers clock Shifts, but the only consumer of Shift data today is the worker-only productivity report — so **courier attendance is recorded but surfaced nowhere** until the deferred delivery reporting (P2: orders-list courier filter + per-courier rollups) is built.
- `collected_by` captures **intake** only. If the business later wants to record which courier *returned* finished items, that is a separate field/decision — this ADR does not cover the return leg.
- A `courier` who is left store-unscoped for attribution but store-scoped for Shifts is an intentional asymmetry; do not "tidy" it by forcing `collected_by` through `assertStoreAccess`.
