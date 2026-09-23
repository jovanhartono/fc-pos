# An admin resets passwords, and nothing else does

A User's password was previously set exactly once, at creation, and could never change: `updateUser` strips `password` from its payload, `PUTUserSchema` omits the field, and the edit form hides the inputs. A worker who forgot theirs had no way back into the app at all. `PUT /admin/users/:id/password` now lets an admin type a replacement and hand it over in person. There is **no self-service password change** and **no way for a User to recover their own password**, by design.

A `users` row carries username, name, password, role and `is_active` — no email, no phone. So the usual "send a reset link" path has nothing to send to, and the shop's answer is the one it already uses for everything else: walk over to the office and ask. Adding a contact column purely to enable a reset email would put an unverified address on every operator record and a mail provider in the deployment, to serve a handful of resets a year across eight stores.

## Considered options

- **Self-service change-password** (user supplies their current password) — rejected for now. It solves "I want to rotate mine", not "I forgot mine", which is the case that actually blocks someone from working. It is additive later if the need appears.
- **Force a change at next login** — rejected. It needs a `must_change_password` column, a gated login response and a change-password screen, and it is only worth that if self-service exists to change it *to*.
- **Refuse when the target is an admin**, making the lockout below an enforced rule — rejected. Prod runs a single admin account today, so the guard would do nothing until a second one existed, and on the day it did exist it would block the obvious fix.

## Consequences

**An admin who forgets their own password is locked out.** Nothing in the app recovers it; the fix is a hand-written hash applied against `DATABASE_URL_PROD`. This is accepted rather than solved.

**The endpoint takes any user id, including an admin's.** Nothing in the code stops an admin resetting another admin's password, or their own. With one admin account in production that is currently theoretical, but it means the lockout above is a convention, not a guarantee — a second admin account turns admin-to-admin reset into a real escape hatch, and that is fine.

**A reset does not sign anyone out.** JWTs are stateless and last a week. `adminMiddleware` re-reads `is_active` from the database on every request ([ADR-0006](0006-permissions-module-shape.md)), so turning a User inactive still cuts their session off on the next call — that, not a password reset, is the lever for a dismissal or a lost phone. Reset answers "I forgot mine", where nobody hostile holds the old token.

**The admin knows the password they issued.** Since the User is never made to change it, an admin retains working credentials for any account they have reset. Order attribution — `paid_by`, `collected_by`, `handler_id` — is weakened accordingly: it records which account acted, which is no longer quite the same as which person. Acceptable at this size, where the admin is the owner, and the reason "force a change at next login" is written down above rather than dismissed.
