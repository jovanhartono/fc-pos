# Clock-in records where the worker was; distance flags, it never blocks

A Shift's clock-in captures the phone's coordinates and the distance to the Store it is opened against ([CONTEXT.md](../../CONTEXT.md) — Shift). **Sharing a location is mandatory: no coordinates, no clock-in.** The distance itself is advisory — anything beyond **1 km** is stored and shown as out-of-range on the Shifts page, but the Shift still opens. Couriers are exempt from the whole mechanism. Clock-out is untouched.

The split is the point: refusing to share a location is a choice the worker makes, so it is refused back. Distance is a *measurement*, and a measurement that is wrong must never be able to stop someone from starting work.

## Considered options

- **Record the distance, flag over 1 km, never block (chosen).** The Shift always opens; the number is evidence, not a gate. Indoor GPS in a mall routinely reports 1–2 km of error, so a hard 1 km fence would reject people standing at the counter. And it would reject them at 07:00, with nobody able to override.
- **Hard block over 1 km.** Rejected: the failure mode is a worker who cannot start their day, and this repo has no admin endpoint to open a Shift on someone's behalf. A control whose false positives are unrecoverable is worse than the behaviour it polices.
- **Hard block plus an admin override endpoint.** Rejected for v1 on cost: the override endpoint, its authorization, and its UI are about as much work as the feature, to serve a case the flag already surfaces.
- **Block on a missing location too — chosen for that half.** A denied permission or a failed fix stops the clock-in. Allowing it would make the whole mechanism opt-out by one tap on Deny.

## Decisions

- **Location is required, distance is not.** `getCurrentPosition` must succeed. A denied permission, a timeout, and `POSITION_UNAVAILABLE` are all treated the same: the Clock in button stays unavailable and says why. There is deliberately **no** "clock in anyway" escape — the only recovery is to retry, accepted knowingly. The screen says "Wait a moment, then try again" and never tells a worker where to stand.
- **1 km is the flag threshold, measured against the Store the Shift is opened against.** Not against the nearest Store — a worker who picks the wrong branch should show up as far from it, which is exactly the mistake worth seeing.
- **The distance is stored, not recomputed on read.** A Store's pin can be edited later; the flag must keep saying how far away the worker was *at the time*, not how far away that spot is from wherever the pin sits today.
- **Couriers are exempt entirely** — no permission prompt, no coordinates, no flag. A Courier is assigned to every Store precisely so they can clock in anywhere ([ADR-0010](0010-courier-role-login-only-excluded-by-allowlist.md)); flagging a roaming role every morning trains everyone to ignore the flag.
- **Clock-out records nothing.** This evidences that someone showed up, not that they stayed. Capturing a location at clock-out would also make clock-out blockable, which can strand a worker in an open Shift on a dead battery.
- **The nearest-Store lookup is a convenience, not the rule.** `/attendance` preselects the closest Store via the existing `GET /admin/stores/nearest`; the worker can still change it, and the server checks store access as it always has.

## Consequences

- **Store coordinates now have a second job.** They were only ever read by an unused nearest-Store endpoint; a wrong pin used to be invisible, and now it makes a whole branch's team read as out-of-range. Pins want checking before this ships and after any edit.
- **`PUT /admin/stores/:id` still accepts any latitude and longitude with no range check and no admin check** (unlike `POST`). Left open deliberately: because distance never blocks, a moved pin corrupts a flag rather than granting access. It becomes urgent the day anyone proposes making the fence hard.
- **The flag is a deterrent, not proof.** Mock-location apps are trivial on Android. This catches clocking in from bed; it does not catch someone determined to fake it.
- **Clock-in coordinates are staff personal data.** The table now holds where each worker was each morning. No retention rule is set — worth one if the row count ever matters.
