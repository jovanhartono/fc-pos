# A Forgotten clock-out gets a normal day until an admin enters the real one

Overtime is paid each month from Shift hours, so the hours on a Shift are money. A Shift still open after midnight is a Forgotten clock-out, because nobody at the shop works past midnight. It is closed 10 hours after clock-in, a normal day at the shop, or at that midnight if that comes sooner, and it is marked auto-closed. The cron at 00:00 Jakarta, Clock in and Clock out all close it the same way. If the worker really stayed late, an admin enters the real times on the Shifts page, and the Shift records which admin did it. A Shift that ends the same day keeps its real time, however long it ran.

**Why Clock out too:** ADR-0020 planned two ways back from a forgotten clock-out, the cron and the next Clock in, and missed a third. A worker who forgot would see "on shift" the next day and tap Clock out. That saved the tap time, so a Shift that started at 08:29 was recorded as running until 15:30 the next day. Prod had 11 such Shifts by October 2026, of up to 31 hours, and each one would have paid as overtime.

**Why the cron closes everything at midnight:** ADR-0020 had the cron reach back a full day, so a late close that started at 22:30 would not be cut off at midnight. That late close does not happen at the shop. In October 2026 the cron ran every night and closed nothing, while the forgotten Shifts reached payroll anyway.

**Why Clock in still closes one:** the cron is best-effort. On 12 October 2026 it failed with a database error, so the next Clock in is the only thing that stops a worker being locked out.

The worker is told once: Clock in or Clock out says "You forgot to clock out on 13 Oct. Shift closed at 18:29." This happens even when the cron closed the Shift overnight. The worker's Attendance page marks that day auto-closed.

## Considered options

- **End a Forgotten clock-out at midnight.** This shipped briefly. It paid up to 5.5 hours of overtime that nobody had worked.
- **Hide the hours until someone corrects them.** It invents no number, but payroll would need a manager to fill in every forgotten day, including the ones that were a normal 10 hours.
- **Treat a Shift open over 16 hours as forgotten.** Dropped once it was clear nobody works past midnight.
- **Let admins edit only auto-closed Shifts.** Rejected: a worker who tapped Clock out late, on the bus home, needs the same correction.

## Consequences

- An edit can make a Shift cross midnight, for the rare real late night. Edits are refused when they would run over 24 hours, end in the future, or overlap another of the worker's Shifts.
- The 10 hours are fixed in code (`FORGOTTEN_SHIFT_HOURS`) until a Settings page exists.
