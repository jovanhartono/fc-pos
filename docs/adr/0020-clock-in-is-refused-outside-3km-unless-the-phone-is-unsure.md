# Clock-in is refused outside 3 km, unless the phone is unsure

A Shift's clock-in is refused when the worker is more than **3 km** from the Store it is opened against ([CONTEXT.md](../../CONTEXT.md) — Shift). **Sharing a location is mandatory: no location, no clock-in.** The phone reports a circle rather than a point, and the worker gets the benefit of it: the refusal fires only when the near edge of that circle is still outside the ring. Nothing about the location is stored — a Shift exists, therefore it passed. Couriers are exempt from the whole mechanism. Clock-out is untouched.

```
refuse when:  distance - accuracy > 3 km
```

## Considered options

- **Refuse outside 3 km, spending the accuracy radius as benefit of the doubt (chosen).** Stops the clock-in from bed, which is the behaviour the rule exists for, while a phone that admits it is guessing can never cost someone their shift.
- **Record the distance, flag beyond 1 km, never refuse.** Shipped first and reversed before merge. A flag only bites if a manager reads a column, and the column existed for nobody: a worker clocking in from home got a Shift and got paid exactly like one at the counter. It also meant holding every worker's coordinates indefinitely to support a screen nobody opened.
- **Refuse whenever the fix is too vague to judge.** Rejected: this is the lockout that killed the hard fence the first time. A worker indoors with no sky and no wifi gets a cell-tower fix several kilometres wide through no fault of their own, and 07:00 is the worst moment to discover it.
- **Refuse on a vague fix, but let the worker retry outdoors first.** Rejected on cost and honesty: it adds screen states, and a worker who has turned off precise location just taps through them.
- **1 km rather than 3 km.** Rejected: 1 km is inside the error a phone can produce indoors, so the refusal would land on people standing at the counter. 3 km is a number a manager can quote back to a worker without an argument.

## Decisions

- **Location is required.** `getCurrentPosition` must succeed. A denied permission, a timeout and `POSITION_UNAVAILABLE` are all treated the same: the Clock in button stays unavailable and says why. There is deliberately **no** "clock in anyway" escape, and no admin override endpoint. Allowing a missing location would make the gate opt-out by one tap on Deny.
- **The accuracy radius is spent in the worker's favour, never against them.** A wide circle can only ever let someone in. It is read at the moment of the decision and discarded.
- **Nothing about the location is stored.** No coordinates, no distance, no accuracy. Under a gate the row's existence carries the fact, and the alternative is a permanent record of where each worker sleeps in exchange for a column nobody queries.
- **Measured against the Store the Shift is opened against**, not the nearest one. A worker who picks the wrong branch is refused, which is the mistake worth catching at the moment it happens.
- **The refusal names the distance and the branch.** "You are 6.2 km from Kemang. Clock in once you are at the store." A worker turned away needs to know whether they are far or the app is broken, and a manager needs a number that was measured rather than recalled.
- **Couriers are exempt entirely** — no permission prompt, no location, no gate. A Courier is assigned to every Store precisely so they can clock in anywhere ([ADR-0010](0010-courier-role-login-only-excluded-by-allowlist.md)), and gating a roaming role would stop the day of anyone whose route starts away from a branch.
- **Clock-out records nothing and is never refused.** This evidences that someone showed up, not that they stayed. Gating clock-out would strand a worker in an open Shift on a dead battery.
- **A forgotten clock-out is recovered at the next clock-in, not only by the nightly sweep.** Clocking in closes a Shift left open from an earlier day and proceeds; a Shift opened today still refuses. Leaving the nightly cron as the only way out reintroduces the lockout: Vercel cron delivery is best-effort and `/api/internal/*` answers 401 whenever `CRON_SECRET` is unset, so one skipped run is a worker who cannot start at 07:00.
- **The sweep reaches back a full day, not to the start of today.** A late close that started at 22:30 is still being worked when the cron fires at midnight; closing it there would blank the app to "Off shift" mid-Shift and file the row as forgotten.
- **The nearest-Store preselect is a convenience, not the rule, and it is computed on the phone.** `/attendance` already holds the Store list it needs, so it sorts that by `distanceKm` rather than asking the server for the nearest Store. The worker can still change the branch, and the server re-measures against whichever branch they picked.

## Consequences

- **A wrong Store pin is now an outage for that branch.** Coordinates used to be decoration; they now decide who may start work. `PUT /admin/stores/:id` gained the same coordinate bounds the create form always had, and pins want checking before this ships and after any edit. The audit script is `packages/server/scripts/audit-store-coordinates.ts`.
- **At 3 km the rings overlap, so a worker can open a Shift against the wrong branch.** Four pairs of production branches sit closer than 6 km, the nearest being Muara Karang and PIK at 2.48 km. Someone standing at one counter is inside both rings and the gate cannot tell them apart; only the branch they picked on screen is checked. Attendance filed against the wrong branch is a mistake the gate does not catch, and the old 1 km ring did.
- **A worker can widen their own circle.** iOS and Android both have a per-app precise-location switch, and turned off the phone returns a deliberately coarse fix every time. That buys a worker ground equal to the coarse radius and no more: someone 10 km away is still refused, because no circle that size reaches the branch. The size of that radius on the staff's own phones has not been measured.
- **Nothing records that a clock-in was let through on a vague fix.** That is the cost of storing nothing, accepted: the alternative is a column whose only reader would be an investigation nobody has asked for.
- **Not a defence against a determined faker.** Coordinates and accuracy both come from the phone, and mock-location apps are trivial on Android. This stops casual clocking in from bed.
- **Auto-closed hours are not real hours, and the worker-productivity report cannot yet tell.** `fetchShiftMinutes` counts any Shift with a `clock_out_at`, so a Shift closed at the day boundary contributes the hours to midnight and pushes `services_per_hour` down. The `auto_closed` flag records which rows those are; nothing reads it yet. Whether those hours are excluded, capped, or just labelled is open.
