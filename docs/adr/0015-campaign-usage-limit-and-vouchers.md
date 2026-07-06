---
Status: proposed
---

# Campaign usage limits and vouchers as code-mode Campaigns

Campaigns today are broadcast discount rules **picked from a list** at the POS by id; every application is already logged in `order_campaigns`, and the Campaign Effectiveness report already sums orders/revenue/discount per Campaign — so "total usage" was never the missing piece. What was missing was (a) a way to **cap** redemptions, and (b) a redeemable **code** a specific person can keep and use later. CONTEXT.md had defined both away: "voucher/coupon are all Campaigns," and the Complaint goodwill voucher was deliberately out-of-band and untracked. We decided to add an optional global **usage limit** to Campaigns and to model a **Voucher** as a *code-mode Campaign* that owns a batch of bearer, single-use codes — reusing the discount engine and the `order_campaigns` ledger rather than standing up a parallel voucher subsystem. This ADR records the locked design ahead of implementation.

## Considered options

- **Voucher as a new noun / table vs. a code-mode Campaign (chose code-mode Campaign).** A Voucher needs a discount, a date window, a Store scope, and eligible Services — every field a Campaign already has, plus the whole stacking/eligibility engine. A separate table would duplicate all of it. Rejected in favour of a `redemption_mode` on the existing Campaign; the only genuinely new structure is the child code batch.
- **Customer-bound codes vs. bearer (chose bearer).** Binding a code to one Customer fights [ADR-0011](0011-pos-creates-customer-atomically-with-order.md): the POS resolves the Customer only *at* checkout via find-or-create, so "only this phone may redeem" would force customer identity to be verified before the Order commits. Bearer codes sidestep this — presenting the code is the only proof — at the cost that a leaked code is spendable by anyone.
- **Restore on cancel only vs. never vs. cancel+refund (chose cancel only).** Symmetric with [ADR-0008](0008-cancel-is-unpaid-per-line-refund-twin.md): a full cancel means the Order never economically happened (it even restores stock), so its redemption returns to the pool; a paid refund leaves the redemption spent, mirroring "refund does not restore stock."
- **Cap on any Campaign vs. code-vouchers only (chose any).** `usage_limit` lives on every Campaign, so a *listed* promo can be capped ("first 100 Orders") without issuing codes.
- **One code per Voucher vs. a batch (chose batch).** A batch (N unique codes from one Voucher definition) scales to "50 codes for 50 VIPs," which a 1:1 code-per-Campaign model can't — at the cost of a child `campaign_codes` table.
- **Overlapping modes vs. mutually exclusive (chose exclusive).** A Campaign is *either* listed-with-optional-`usage_limit` *or* code-with-a-batch, never both. The batch size is a code Campaign's cap, so a second overlapping limit would only confuse.

## Decisions

- **`redemption_mode` on Campaign (`listed` | `code`), default `listed`.** Listed Campaigns are picked from the POS list as today. Code Campaigns (Vouchers) are never listed; they are applied by typing a code, which the server resolves to its Campaign.
- **`usage_limit` (nullable) + `redeemed_count` on Campaign, listed mode only.** `usage_limit` null = unlimited (today's behaviour). The cap is enforced by an **atomic conditional increment** — `redeemed_count = redeemed_count + 1 WHERE redeemed_count < usage_limit RETURNING` — the same race-proof pattern as `products.stock` decrement, so two concurrent checkouts can never both take the last slot.
- **`campaign_codes` child table, code mode only.** Each row is one bearer, single-use code: `code` (globally UNIQUE, random, non-enumerable), `redeemed_at`, `redeemed_order_id`. Redemption is an atomic claim — `SET redeemed_at = now(), redeemed_order_id = ? WHERE code = ? AND redeemed_at IS NULL RETURNING` — so a code can never be spent twice. Codes are minted when the Voucher is created; the batch size is the Campaign's effective cap.
- **Mutual exclusivity is a constraint.** A code Campaign carries no `usage_limit`; a listed Campaign owns no codes. Enforced by CHECK so the two modes can't blur.
- **`order_campaigns` gains `code_id` (nullable FK → `campaign_codes`).** The existing per-Order ledger names the specific code burned on a code redemption; null for listed Campaigns. `order_campaigns` remains the usage source of truth.
- **Restore on full cancel only — new behaviour.** Nothing touches `order_campaigns` on cancel today; this adds a hook so that when an Order becomes **fully** cancelled (every line cancelled), each of its redemptions is released: listed → `redeemed_count--`, code → null the code's `redeemed_at`/`redeemed_order_id`. A partial per-line cancel and a paid refund never release a redemption.
- **Lifecycle: mint-at-create, revoke = deactivate the Campaign.** Codes are generated once at creation. `is_active` and `ends_at` govern the whole Voucher; deactivating or expiring it kills every code. No per-code revoke and no "add more codes" in this iteration — issue another Voucher instead.
- **Stacking and the Usable rules are unchanged.** A Voucher stacks like any Campaign; the existing active / date-window / Store-scope / min-order / eligible-service gates all still apply, plus (listed) not-at-limit and (code) code-exists-and-unredeemed.
- **Reporting is aggregate + remaining.** The Campaign Effectiveness report already gives per-Campaign totals; a Voucher additionally surfaces "X of N codes redeemed." No per-code audit view in this iteration — it stays derivable from the `order_campaigns` ⋈ `campaign_codes` join.

## Consequences

- The cancel path gains a new responsibility (release redemptions on full cancel) and `redeemed_count` / `campaign_codes.redeemed_at` become writers that must stay consistent with `order_campaigns`. This is the most surprising part: a redemption is *not* released on refund, only on full cancel — the same asymmetry as stock in [ADR-0008](0008-cancel-is-unpaid-per-line-refund-twin.md).
- Voucher codes are money-bearing secrets. Because they are bearer, generation must use real entropy (non-enumerable) and the UNIQUE index guards collisions; a leaked code is spendable until the Campaign is deactivated.
- CONTEXT.md's "voucher/coupon are all Campaigns" stance is now sharpened, not reversed: a **Voucher is a code-mode Campaign**. The Complaint goodwill voucher stays out-of-band per [ADR-0013](0013-complaint-and-rework-line.md); this mechanism *could* back it later (a code Voucher is bearer, not customer-scoped), but that is out of scope here.
- Schema changes (Campaign columns + CHECK, `campaign_codes`, `order_campaigns.code_id`) ship via `push:dev` and must reach prod via `push:prod` before the next deploy; verify the CHECK and UNIQUE constraints via `pg_constraint` since `push` applies them silently.
