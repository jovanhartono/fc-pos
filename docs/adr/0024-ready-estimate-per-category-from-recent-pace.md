# The Ready estimate is per Category, from the last 7 open days, and after-clean days add up

> **Superseded 2026-10-26** by [ADR-0027](0027-ready-estimate-is-the-p90-of-recent-items.md): the quote is now the p90 of recent Items per Category, after prod backtests showed pile ÷ pace quoting 2–3 days for shoes that took 7.

The Counter tells a customer "about X–Y days". We quote each Category on its own, as that Category's waiting OrderServices divided by its Services processed per day over the Store's last 7 open days. A day with no quality check at the Store at all, such as a public holiday, is not an open day. An After-clean Category (marked "Starts after cleaning" on the Category) adds its days on top of the clean, and two after-clean Services on one Item add up too. A slow Category looks further back, open day by open day, until it has 7 checks, up to 4 weeks. With fewer it shows its waiting count but no quote: on prod, two Repair checks in a week had quoted 42–43 days. Nothing shows for a Store under 14 days old.

**Why per Category:** the workshop is not one first-in-first-out queue. Cleaners and artisans work their own Categories at their own pace, so one Store-wide quote gave a Repaint customer the Deep Clean pace.

**Why 7 open days, not 14 calendar days:** a backtest on prod in October 2026 showed that a 14-day average lags a Store that is still speeding up. CR6 doubled its output in four weeks, and the 14-day quote said 8–9 days while 98% of Orders came back more than a day early. The 7-day quote was still safe: 95% of Orders were ready by its end. Counting closed days as zero would have stretched the quote for a week after every public holiday, so they drop out instead. No holiday calendar is needed.

**Why a flag on Category, not a list of names:** admins add and rename Categories. Matching names like "Repaint" in code would break silently on a rename.

## Considered options

- **One Store-wide quote** (the first design, October 2026). Dropped once it was clear that work runs in lanes.
- **"How long recent Orders took"** (turnaround). Rejected because it only notices a rush, such as 121 Services arriving in two days, after the customers have already waited.
- **A day threshold for stuck Items.** Rejected: X days is normal for one Store and late for another. A Stuck Item is one passed over in its own Category by more than that Category's day of work instead. "Any newer Item went first" flagged 57 lines at CR6 and mostly noise at FGS. Fixed thresholds wait for the Settings menu (#159).

Update 2026-10-14: Stuck Items were removed from the Counter; the owner found the list confusing.
