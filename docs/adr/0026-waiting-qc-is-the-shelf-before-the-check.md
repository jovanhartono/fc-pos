# Waiting QC is the shelf before the check

The OrderService status `quality_check` is renamed `waiting_qc`, shown as "Waiting QC": the work is done and the Item is on the shelf, waiting for its quality check. The worker taps Done (`processing → waiting_qc`) when the Item goes on the shelf, so it leaves their hands there. Anyone then passes it (`→ ready_for_pickup`) or rejects it (`→ qc_reject`). QC stays open to all staff and self-QC stays allowed ([ADR-0004](0004-role-capabilities-v1.md), 2026-06-04 and 2026-10-05 amendments).

**Why:** on prod an Item spent 0 minutes in `quality_check`. The person checking tapped it and Ready in the same minute, so the time a finished shoe sat on the shelf was counted as processing, and workers looked like they held far more work than they did.

**Why a rename, not a new status:** old reports stay continuous. An old `quality_check` row now reads as the Item reaching the shelf, logged seconds before it was ready.

## Considered options

- **A "being inspected" status between the shelf and ready.** Rejected: an inspection takes minutes, and it would cost a tap per shoe.
- **New `head_store` and `artisan` roles.** Rejected: each would copy every worker permission. A head store is a worker, with `can_process_pickup` if they hand shoes back. An artisan is a worker with the Queue's Only: Repair filter, saved per browser. A cashier covers QC.

## Consequences

- The reports' "processed" moment (Services processed, Day worked) is the worker's Done, not the check.
- Rows from before the rename keep shelf time inside processing, so a worker's held work and time in progress read higher before 2026-10-26 than after.
