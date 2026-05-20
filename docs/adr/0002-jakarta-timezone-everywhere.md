# Jakarta timezone everywhere (GMT+7)

All wall-clock computation — day/week/month boundaries, reporting windows, chart buckets, date-string formatting for query params — runs in **`Asia/Jakarta`** (GMT+7, no DST). The IANA name is an implementation detail; UI copy never shows "GMT+7" or "Asia/Jakarta" — assume local time and print absolute dates.

## Why

- Indonesia-only business, single timezone, no DST.
- Server runs on UTC. Raw `dayjs()` boundaries would silently shift report cutoffs by 7 hours and produce off-by-one-day rows. Hit this once already (v1 audit item A-4), patched at runtime.
- Reports use SQL `AT TIME ZONE 'Asia/Jakarta'`; app code must match via `dayjs.tz("Asia/Jakarta")` or aggregates diverge from list pages.

## Consequences

- Every `dayjs()` call computing a day/week/month boundary or formatting a date string **must** use `.tz("Asia/Jakarta")`, ideally via helpers in `packages/server/src/utils/date.ts` (`jakartaNow`, `jakartaDayStart`, `jakartaDayEnd`).
- Server entry bootstraps `utc` + `timezone` plugins; do not remove.
- Server date-shaped query params (`from`, `to`, `date`) require `YYYY-MM-DD`. Sending `toISOString()` is a bug.
- Expanding to non-WIB regions (WITA, WIT, or outside Indonesia) would require generalising the helpers and SQL, not deleting the rule.
