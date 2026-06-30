# Complaints and the rework line

A Customer returns after collection — the pair was cleaned poorly, they are dissatisfied. The owning `OrderService` is already `picked_up`, a **terminal** status whose only legal exit is `refunded` ([CONTEXT.md](../../CONTEXT.md) — OrderService status). The shop's real handling is an **escalation ladder**, not a single outcome: re-clean the pair first (a *rework*); if the result still fails, refund the original line and hand the Customer a goodwill voucher for a future Order. Complaints run ~1–2% of all OrderService lines, and **complaint rate is a metric the business wants to track** (per store, service, worker).

We model a **Complaint** as a first-class, append-only record linked to the original `OrderService`, and a **rework** as a new free `OrderService` line on the **same** Order. `picked_up` stays terminal; the original line is never mutated.

> "Rework" is the operator-facing term chosen for the re-clean line (button "Start rework", badge "REWORK"). The earlier draft called it a "redo line"; "rework" replaced it.

## Considered options

- **Reopen `picked_up → processing`.** Rejected. It mutates settled history: the pickup event, code validation, and payment all genuinely happened. Reopening writes an illegal `picked_up → processing` status-log line, retroactively un-completes a done Order, and leaves the re-collected pair needing a second pickup event with no clean code/payment story. This repo's instinct is to *append* corrections, never rewrite a terminal fact (cf. refund is a separate record, cancel is a per-line marker).

- **A separate $0 rework Order** (new `orders` row). Rejected. A zero-value Order collides head-on with binary payment ([ADR-0001](0001-payment-is-binary.md)): it must be `paid` to ever be picked up ([ADR-0009](0009-payment-precedes-pickup.md)), yet `paid` requires a PaymentMethod and no tender exists. The only escape is a "paid-at-zero, null-method" carve-out plus a fresh pickup code — which contradicts how the shop actually works: **same Order, same code, no new receipt.** More machinery, a dented invariant, and a model the counter staff don't share.

- **Rework as a new free `OrderService` line on the *same* Order (chosen).** The Order is already `paid`, so a `price = 0` line dissolves the payment paradox entirely — no zero-value Order, no null-method exception, no new pickup code. The original `picked_up` line stays terminal and untouched; only a *new* line is added. The Order rollup legitimately flows `completed → processing → ready_for_pickup → completed` as the rework runs and is collected — honest (the Order really is back in the shop) and self-healing, since Order status is derived live. **Zero status-machine changes**: `deriveOrderStatus` already produces the right rollup, and the rework rides every existing seam (queue, photo gate, pickup-code validation).

- **No Complaint table — a reason-tagged refund plus a note.** Rejected. Complaint rate is an important metric; a free rework line is indistinguishable from a legitimate second service without a record tying rework + maybe-refund + maybe-voucher to one grievance. The metric is the reason the entity exists.

## Decisions

- **`complaints` table** — `order_service_id` FK → the original (complained) line; `status` (`open` / `closed`); `resolution` (`rework` / `refund` / `rejected`, set on close); a free-text reason; `voucher_promised`; `opened_by` / `closed_by`; timestamps. Append-only — a Complaint records history, it is never rewritten. A partial unique index allows **at most one open Complaint per line**; a CHECK forces `resolution` non-null once `status = closed`.
- **Rework = a new `OrderService` line on the original Order**, `price = 0`, `is_priority = true` (complaints jump the queue), `status = queued`, carrying a nullable `complaint_id` FK back to the Complaint that spawned it. A non-null `complaint_id` **is** the marker that a line is a rework. A Complaint owns **0..N** rework lines: zero = straight to refund, usually one, multiple allowed.
- **Adding an `OrderService` to an existing Order is a new capability.** Today OrderServices are created only at checkout; the complaint flow inserts one onto an already-committed Order.
- **The rework flows through every existing seam unchanged.** It satisfies the [ADR-0012](0012-photo-precedes-processing.md) photo gate naturally (the worker photographs the returned pair before re-processing), and is collected through the normal pickup flow against the **original Order's** pickup code — no new code, no new receipt.
- **Order status oscillates by design.** The Order leaves `completed` while a rework is active and returns when it is collected; `completed_at` shifts to the rework's pickup date. Revenue books off `paid_at` (unchanged), so money reporting is unaffected.
- **Escalation to refund reuses the existing path.** When a rework still fails, an admin refunds the **original paid line** via the refund flow (`picked_up → refunded`, `applyRefundTransition`) — admin-only per [ADR-0004](0004-role-capabilities-v1.md). The ₀ rework line is left as-is (collected or uncollected) and is excluded from the refund picker; at zero value it never touches refund amounts.
- **Permissions.** Opening a Complaint, adding a rework, and resolving are open to **any staff** (the cashier takes the return at the counter). Escalating to a refund is **admin-only** (the existing money gate). Rework work is role-open (the processing axis). Closing is a compare-and-set on `status = open`, so two concurrent resolves cannot overwrite each other.
- **Voucher is out of band.** The goodwill voucher is recorded only as *promised* on the Complaint; staff issue it manually. No customer-scoped Campaign exists in v1 — building one is deferred.
- **Complaint rate denominator excludes rework lines.** Complaint rate = Complaints ÷ OrderService lines where `complaint_id IS NULL`. A rework must not inflate the denominator of the grievance that created it. (The rate metric itself is a deferred follow-up — the table and exclusion marker ship now.)
- **Window is not enforced.** The shop's ~2-day "complain by" window stays verbal; the system records a Complaint whenever one is opened.

## Consequences

- **New web surface:** a Complaints menu/page listing every Complaint, plus an "Open complaint" action on the order detail page and a "Rework"/"Complaint" badge on the affected line. Listing and detail are read-mostly; the rate metric is a deferred Reports follow-up.
- **No schema migration of existing rows, no payment exception, no status-machine change** — only a new `complaints` table and a nullable `complaints.id` FK on `orders_services`.
- **A complained Order has an unstable `completed_at`** and can re-enter `processing`. Any "completed in period" count reflects the rework date; `completed` is no longer strictly terminal at the Order level for the ~1–2% of Orders with a rework.
- **Worker-productivity reporting counts rework labor at ₀ revenue** — a worker who reworks a pair did real work that bills nothing. Acceptable at 1–2%; revisit only if the signal grows.
- **The voucher remains manual** until/unless a customer-scoped Campaign concept is built; the Complaint record is where the promise lives in the meantime.

## Amendment 2026-06-30 — Complaint drops its status pipeline

A code review (findings #1/#2) surfaced two problems with the authored `status`/`resolution` pipeline on the Complaint:

1. `resolution: "refund"` was settable by **any** staff with **no actual refund** anywhere — the record could claim an escalation that never moved money (the route is JWT-gated, not role-gated, and the field is just a label).
2. `addRework` only checked the Complaint was `open`, never the original line's state, so a free Rework could be attached to an already-`refunded` line, inverting the ladder.

The deeper issue: the Complaint's `status`/`resolution` is a **second, authored** status pipeline sitting on top of facts that already live on the lines. This repo's spine is "**status is derived from the truth-source, never authored**" (Order status rolls up from line states). The Complaint violated that.

**Decision: the Complaint becomes a write-once grievance log.** The row is `order_service_id`, `reason`, `opened_by`, `created_at` — nothing else. Its outcome is **derived from the lines**, never stored:

- **reworked** → a Rework line exists (`orders_services.complaint_id = complaint.id`)
- **refunded** → the original line's status is `refunded`
- **pending** → neither

This **supersedes** these original Decisions:

- `status` (`open`/`closed`) and `resolution` (`rework`/`refund`/`rejected`) columns — **dropped**, with their enums (`complaint_status_enum`, `complaint_resolution_enum`), the `resolution_note` column, the status index, and the `closed_requires_resolution` CHECK.
- "at most one **open** Complaint per line (partial unique index)" → **one Complaint per original line for its lifetime** (`order_service_id` is `UNIQUE`). A Complaint is the whole grievance *episode*; "still bad after a rework" is handled *inside* it (another Rework, or escalate to refund), not by opening a second Complaint.
- The `"rejected"` outcome — **deleted**. A Complaint row is an *already-accepted* grievance; the shop does not record "we declined".
- "resolving is open to any staff" + the `PATCH /:id` resolve endpoint — **removed**. The row never mutates after open, so there is no resolve endpoint at all.
- `voucher_promised`, `closed_by`, `closed_at`, `updated_at` — **dropped**. The voucher stays fully **out of band and untracked** in v1 (it was already "out of band"; we stop half-tracking the promise).

**Surviving correctness guards:**

- `openComplaint` rejects a subject that is itself a Rework line (`complaint_id IS NOT NULL`) — complaints attach only to real lines, keeping the one-per-line rule and the complaint-rate denominator (which excludes Rework lines) coherent.
- `addRework` rejects unless the original line is still `picked_up`. Once it is `refunded` (the terminal rung), the ladder is done. This replaces the old "is the Complaint open?" gate and is the fix for finding #2.

The escalation ladder is unchanged in spirit — Rework (0..N) first, admin-only refund of the original line as the terminal rung — but its *position is read from the lines*, not written onto the Complaint. The refund/reversal module stays complaint-agnostic; the `addRework` `picked_up` gate prevents the only incoherent state that decoupling could create. Finding #1 disappears outright: there is no `resolution` field left to lie.
