# The Ready estimate is the p90 of recent Items, per Category

Supersedes [ADR-0024](0024-ready-estimate-per-category-from-recent-pace.md).

The Counter quotes each Category, per Store, as the p90 of drop-off to ready, in days rounded up, over that Category's Items that became ready in the last 14 days. With fewer than 10 such Items it looks back 28 days; with still fewer it shows "Not enough data yet". The quote reads "N days · Thu 29 Oct", the days and the date. An Order with Services in several Categories gets one date per Category, read off each Counter line. An Item's time already includes its clean, so After-clean Categories no longer add days on top. The p90, nearest-rank and 10-Item rules are the Turnaround report's; the windows are the estimate's own.

**Why not pile ÷ pace (ADR-0024):** prod backtests rejected it. CR6 does not take shoes in order, so the pile says little about one shoe: it quoted 2–3 days while shoes took 7.

**Why p90 of history:** it came back on time for 92% of Items at CR6 and 67% at FGS, whose pile jumped on 10–12 October while history lags about a week. 7, 14 and 28-day windows scored the same: 90/90/89% on prod at CR6, and 89/90/92% in normal weeks over four years of the daily report replayed, about 81% around Lebaran and 83% at Christmas.

## Considered options

- **A self-correcting factor on top of pile ÷ pace.** 37% on time at CR6, 0 of 28 at FGS.
- **The longer of p90 and pile ÷ pace.** Overquoted FGS by 18–29 days when about 9 was real, because a Store's pace reads low in its first weeks on the app.
- **A manager override per Category, with an end date.** Rejected.
- **An automatic backlog warning.** Rejected.
- **A holiday floor: never shorter than last year's same holiday.** 91% at Lebaran and 92% at Christmas, but it overquotes for a whole season after one bad year.
- **A separate quote for Priority.** Rejected.

## Consequences

- When a pile jumps, as at Eid, the quote lags about a week. Accepted.
- Revisit a pile-based formula once Stores take shoes in the Queue's order (soft FIFO, a shop habit, not enforced) and pace has held steady for a month.
