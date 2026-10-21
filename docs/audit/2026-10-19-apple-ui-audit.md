# UI audit — merge candidates and Apple gaps (2026-10-19)

Branch `feat/reports-redesign`, after the Apple tokens and the segmented-control tabs. Paths are under `apps/web/src`. Nothing here is built yet.

## A. Pieces that can become one component

| # | Group | Copies | Target | Risk |
|---|---|---|---|---|
| 1 | Section heading "Title · count" over a bordered list (Counter, Reports, worker sheet); heading size varies 14–16px, semibold vs medium | 10+ | grow `ReportSection` into `components/section.tsx` (title, count, aside, empty) | low |
| 2 | Loading skeletons: 3 looks, none uses `ui/skeleton`; Workers/Quality tabs flash two different skeletons back to back | 8 | `Skeleton` + one report skeleton | low |
| 3 | Dashed empty-state box (`data-table-cards:139`, `orders.index:443`, `queue.index:583,623`, `queue-service-detail:464`, `checkout-items-step:87`) | 6 | `components/empty-state.tsx` | low |
| 4 | Tone chips rebuilding `Badge` (`tone-chip.tsx`, day-close `Tag`, "Existing customer", "No price yet") | 5 files | `Badge` + a `neutral` variant | low–med |
| 5 | Detail-page "not found / failed" message; 4 detail pages, 4 looks | 4 | `components/detail-message.tsx` | low |
| 6 | KPI change line (arrow + colour + %) in `kpi-card` and `financial-panel` | 2 | export `DeltaLine` from `kpi-card` | med |
| 7 | Filter button + dialog (Orders h-10, Queue h-9, Reports a popover) | 3 | `components/filter-dialog.tsx` | med |
| 8 | Selected/unselected button groups: `aria-pressed` buttons (POS chips, item tray, queue category, reversal form) and two hand-built black/white segmented toggles in Reports | 6 | shadcn `toggle-group`; the two Reports toggles → the new segmented `Tabs` look | med |
| 9 | Admin tables: identical Edit buttons and Active/Inactive badges | 9 + 6 | `EditRowButton`, `ActiveBadge` | very low |
| 10 | POS search box hand-copies `debounced-search-input` and its own `/` hint | 2 | plain `SearchInput` + `KeyHint` | low |
| 11 | Report `<table>`s with the same muted header row | 5 | `ui/table` | med (sticky cols, matrix) |
| 12 | Small: coloured note boxes (5, different padding) → `Callout`; `<details>` sections with a rotating caret (4) | 9 | — | low |

Unused, delete with an ok: `campaign-autocomplete.tsx`, `product-autocomplete.tsx`, `service-autocomplete.tsx`, `payment-method-autocomplete.tsx`, `components/mode-toggle.tsx`.

Bug found on the way: `services-multi-autocomplete.tsx:126` uses `w-(--radix-popover-trigger-width)`, a Radix variable that does nothing under Base UI, so the Campaign form's Services dropdown doesn't match its field width. Base UI's is `--anchor-width`.

## B. Not Apple-like yet (most visible first)

| # | What | Now | Apple target | Effort |
|---|---|---|---|---|
| 1 | Selected states | black fills/outlines left from the old theme: POS tiles, checkout steps, report filters, pickup count, date picker, table selected row | solid `bg-primary`; card selection `ring-2 ring-primary bg-primary/8`; counts as a blue capsule | M (~14 sites) |
| 2 | Progress + sparkline bars | black | `h-1.5 rounded-full`, track `bg-soft-bar-track`, fill `bg-primary` (`bg-success` when done) | S–M |
| 3 | Chip strips (Queue statuses, POS categories) | 44px outlined squares | capsules, `bg-secondary`, selected `bg-primary` | S |
| 4 | Table header + footer | heavy grey fill | white header, grey 12px label, hairline only; selected row `bg-primary/10` | S |
| 5 | Toasts | solid green/red fills + X | frosted `bg-popover/85 backdrop-blur`, 20px radius, only the icon coloured | S |
| 6 | Badges | `info`/`priority` hard-code sky/orange; Paid/Unpaid outlined | `rounded-full`, no border, tinted fills; Priority gets its own colour | S |
| 7 | Control heights | button 32px vs input 40/44px; 12px text in fields | one height: 36px desktop, 44px touch; 13px text | M |
| 8 | Phone sheet | right-side panel, no grabber | bottom sheet, 20px top radius, grabber, centred 17px title | L |
| 9 | Confirm dialog | X beside Cancel, small right-aligned buttons, blurred backdrop | iOS alert: no X, 17px title, two equal buttons, no blur | S–M |
| 10 | Menus / select / combobox popups | solid, 10px radius, grey hover | frosted, 12px radius, softer shadow, blue hover on desktop | M |
| 11 | Switch | 32×18, blue, black thumb in dark | iOS green, white thumb, 51×31 touch / 40×24 desktop | S |
| 12 | Bottom tab bar (phone) | black active text, same icon both states | blue active + filled icon, frosted bar | S |
| 13 | Empty states | dashed boxes | no border, centred muted text | S (with A3) |
| 14 | Uppercase tracked labels | ROLE/ADMIN, CLOCK IN, customer name h1, 11px mono labels | sentence case, 12–13px | S |
| 15 | Tooltip | black bubble, arrow, no delay | light popover style, no arrow, ~500ms delay | S |
| 16 | Calendar | 28px cells, square selected, filled today | 36–40px cells, round blue selected, blue "today" text | S–M |
| 17 | Focus ring | 1px | 3px soft halo | S |
| 18 | Pickup rows | "/" separators, → arrow | "·" separators, grey caret | S |
| 19 | Phone list cards | one card per row, 8px gaps | one inset grouped list with hairlines (like Counter) | M–L |
| 20 | Outline buttons, dark | keep a border | grey filled button, no border | S |

Leave alone: the tokens, PageHeader title, sidebar labels and selected pill, Counter's grouped list, 44px touch inputs, the rounded-square checkbox (that *is* macOS), `/track`'s own colours, the green NOTIFIED label.
