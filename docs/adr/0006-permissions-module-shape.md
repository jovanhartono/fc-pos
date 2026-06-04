# Permissions module shape

The ADR-0004 capability matrix is encoded as a pure, in-memory module at `packages/server/src/modules/permissions/permissions.ts`. It exports one `assertCan*` function per matrix row and lives alongside — not inside — the existing `utils/authorization.ts` (store-scoping, DB-reading).

## Considered options

### 1. Pure module vs DB-reading module

Order-aware checks (`assertCanCancelOrderService`, `assertCanRefundOrderService`) need `order.payment_status`. Two ways to source it:

- **Pure** — caller loads the Order, passes it in. Signature `assertCan*(user, order)`.
- **DB-reading** — module takes an `orderId`, fetches internally. Signature `assertCan*(user, orderId)`.

**Picked pure.** Every existing caller already loads the Order for other reasons (refund handler reads it for refund caps; cancel handler reads it for `cancelled_at`). The DB-reading version would duplicate the fetch or force callers to re-pass the Order anyway. Pure module also keeps unit tests DB-free (matches the `bun:test` strategy from the Order Status Machine refactor — no test-DB prerequisite to land).

### 2. Coexistence with the Order Status Machine

The state machine's `transitionOrderService` already throws on paid-Order cancel attempts. Three options:

- **Defense in depth** — both check payment_status, both can throw.
- **Trust the machine** — permissions skips payment_status, only checks role.
- **Split responsibility** — permissions = `role × payment_status` (the ADR-0004 matrix as code); state machine = `status × transition` (the graph as code). Different axes, both can throw.

**Picked split responsibility.** ADR-0004 is literally a `role × payment_status` table; encoding it without the payment dimension would make the file a thin role check, not the matrix. Permissions runs first (no transition lookup) and produces a 403 — the right error class for "wrong role for this op". The state-machine check produces 422 for "illegal transition". Same root cause for paid-cancel, different concerns, different error class. Refund's payment guard lives only here (state machine has no equivalent — refund is the only path on paid Orders).

### 3. Absorb `utils/authorization.ts`?

The existing `utils/authorization.ts` houses `assertStoreAccess`, `assertOrderAccess`, `buildStoreWhereClause` — DB-reading checks that enforce multi-tenancy isolation (this User belongs to this Store).

- **Absorb** — one umbrella `permissions/` module mixing pure + DB code.
- **Parallel** — two modules with disjoint concerns.

**Picked parallel.** Capability matrix is "what an operator may do" (role-driven). Store-scoping is "which records an operator may touch" (membership-driven). Different concept, different test strategy (pure unit vs DB-fixtures). Keeping them split lets the pure module land without the deferred test-DB strategy.

`buildStoreWhereClause` is query construction, not assertion — it does not belong in either module long-term; left in place for this refactor.

### 4. Migration path

Four old copies exist (two `assertIsAdmin` duplicates, `assertCanProcessPaymentOrRefund`, `assertCanProcessPickup`, plus a route-shape `assertIsAdmin(c)` in `routes/admin/users.ts`).

- **Re-export shims** at old paths to phase the migration.
- **Hard move**, all call sites updated in one PR.

**Picked hard move.** ~10 call sites across 4 files; no external consumers. Shims hide the rename in git blame and defeat the goal of making the matrix visible. The `users.ts` route copy has a different signature (takes Hono context), which forces a shape change at the call site regardless — may as well change all callers at once.

## Consequences

- **Assert location is pragmatic, not uniform.** Service-layer asserts when the service already takes `user` for business reasons (campaigns, orders use `user.id` for store-scoping, handler logging, etc.). Route-layer asserts when adding `user` to the service signature would be plumbing-for-plumbing (users CRUD). Rule: "if the service already has `user`, assert in the service; else in the route."
- **Permissions module is the only place to read the ADR-0004 matrix.** Any new capability row added to ADR-0004 requires a new `assertCan*` function; any rename in ADR-0004 requires a rename here. The two are kept in lockstep — that is the point of the module existing.
- **`adminMiddleware` authenticates and refreshes auth state; it does not authorize capabilities.** It composes `jwt()` (signature + `exp`; the JWT is an identity proof) with a prepared-statement PK lookup on `users` that rejects `!is_active` with 401 and overwrites the stale JWT fields with DB values — so deactivation and role changes take effect on the next request, not at token expiry (7 days). Costs +1 indexed PK query per `/admin/*` request, in line with the 1–2 queries order routes already pay for store-scoping. Rejected alternatives: short-TTL + refresh tokens (slower lockout, more web auth infra) and revocation lists (same DB read plus bookkeeping). Handlers still need an explicit `assertCan*` at the right layer per the rule above.
- **Permissions and the state machine both throw on paid-cancel.** Order matters: permissions runs first and produces a 403; the state-machine check is only ever hit if the role+payment combination passed permissions but the row's current status disallows the transition. That ordering is deliberate — the role error is the more actionable one for the operator.
