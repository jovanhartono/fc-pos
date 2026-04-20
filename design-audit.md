# Fresclean POS — Design & UX Audit

**Reviewer:** Claude (with operator in-the-loop)
**Date:** 2026-04-18
**Scope:** All 18 routes in `apps/web` · Viewports 1440 / 1024 / 390
**Depth:** Full IA + redesign proposals
**Delivery format:** This file
**Status:** Owner decisions captured — see §7. Roadmap in §6 is now actionable.

---

## 0 · TL;DR

| # | Finding | Severity | Where |
| - | - | - | - |
| 1 | Sidebar footer (user card + **Shift Clock**) overlays the **Transactions** nav item — the daily-driver route has no nav affordance on 1440/1024. | **P0** | `AppShell` footer + nav overflow |
| 2 | Every admin table uses `min-w-[720px]` — forces horizontal scroll on mobile for all master-data views. Status chips get cut off on 390. | **P0** | `components/ui/data-table` |
| 3 | Dashboard is nine flat count tiles with no revenue, trend, queue depth, alerts, or drill-through. Zero operational value. | **P0** | `/` |
| 4 | Public `/track` page has no logo, no hero, no brand — a bare form floating on white. It is the only page a customer ever sees. | **P0** | `track.tsx` |
| 5 | Order detail uses native `<input type="file">` (“Choose File No file chosen”) inside an otherwise-styled POS. Photos are broken-image placeholders in dev. | **P1** | `orders.$orderId` |
| 6 | Create Order (`/orders/new`) duplicates the POS workspace with no running total, scattered item attributes, and weak primary action. | **P1** | `orders.new` |
| 7 | Two co-existing order-creation entry points (`/orders/new` **and** `/transactions`) — no conceptual split. Cashiers face choice paralysis. | **P1** | IA |
| 8 | Reports is a four-tile day snapshot with no chart, no comparison, no drill-through — same failure mode as Dashboard. | **P1** | `/reports` |
| 9 | Search is submit-on-button on Orders / Customers / Users / Queue lookup. Standard expectation is debounce-on-type. | **P2** | list views |
| 10 | No destructive-action confirm on sheet close with dirty forms. Closing an Edit sheet discards unsaved work silently. | **P2** | sheet CRUD |
| 11 | JetBrains Mono everywhere + zero hue + rigid borders reads as “developer terminal,” not “laundry POS.” Brand feels generic despite the rigidity premise. | **P2** | design system |
| 12 | Pickup Radar sheet truncates chips (`Ready for P`) and store names (`Fresclean B…`) — right-side sheet is too narrow for its payload. | **P2** | orders list |

*P0 = blocks a user or hides a core action. P1 = significant loss of efficiency/trust. P2 = polish & coherence.*

---

## 1 · Design-system baseline (what currently exists)

| Token | Value | Observation |
| - | - | - |
| Font sans | `JetBrains Mono Variable` | Monospace set as the entire sans stack. Everything (prose, labels, numbers, ₨ amounts) is tabular. Strong aesthetic premise but no display pair, no soft counterpoint. |
| Colors | All-grey `oklch(0.15…0.99)` with single `destructive` red + single `success` green | Zero hue in primary/accent/secondary. Charts use blue ramp only. Status chips improvise their own palette inline. |
| Radius | `--radius: 0.625rem` defined, but `AGENTS.md` tells contributors to avoid `rounded-*`. | Token and guideline disagree. Components inconsistently follow one or the other. |
| Chart palette | 5 blues (`chart-1..5`) | Never appears in the app — all visualisations are missing. |
| Success foreground | `oklch(0.985 0 0)` in light | Paired backgrounds are often `success`-tinted fills (e.g. green chips) with dark text, not `success-foreground`. Token unused. |
| Dark mode | Fully defined | Shipped; toggle lives in sidebar footer. |

**Takeaway:** the token palette is richer than the product uses. Chart colors, success foreground, and radius scale are all dead code. The product is **stricter than its tokens**, not the other way round.

---

## 2 · Shell, navigation, information architecture

### 2.1 Sidebar layout bugs (P0)

Reproduced at 1440 × 900 and 1024 × 768 on `/` and `/transactions`:

- Sidebar footer contains **user card + theme toggle + logout + role chip + ShiftClockCard** stacked vertically. At standard heights this block exceeds the space freed by the main nav, so the `SidebarContent` scroll clips the **Transactions** menu item entirely.
- Consequence: the app’s primary daily-driver route (Transactions POS) is not reachable from the sidebar on desktop unless the user already knows the URL.
- Contributing cause: `SidebarGroupLabel "Transactions"` renders, but the `SidebarMenuButton` beneath it is below the footer’s y-coordinate and `SidebarContent` has no `min-h-0` / `overflow-auto` pair.

**Proposal:**
1. Move `ShiftClockCard` out of the footer into a small top-right chip in the `section` header (it is status, not navigation).
2. Reduce footer to: avatar + name + role chip + single `⋯` menu (theme, logout).
3. Promote **Transactions** from the bottom group to the very top of `mainNavigation` — it is the primary surface.

### 2.2 Group taxonomy

Current groups:

```
(ungrouped)  Dashboard · Queue
Master Data  Orders · Campaigns · Customers · Users · Stores ·
             Categories · Services · Products · Payment Methods ·
             Shifts · Reports
Transactions Transactions
```

Problems:
- **“Master Data”** mixes operational views (Orders, Campaigns, Shifts, Reports) with true catalog master data (Services, Products, Categories, Payment Methods, Stores). A cashier scanning the sidebar cannot tell at a glance where Orders lives.
- **“Transactions”** group contains exactly one item, so the group label is noise.
- **Queue / Dashboard** floating without a header is fine for two items, but with Transactions promoted it becomes a real group.

**Proposed IA:**

```
Work             Transactions · Queue · Orders · Shifts
Customers        Customers · Campaigns
Catalog          Services · Products · Categories · Payment Methods
Operations       Stores · Users · Reports · Dashboard
```

Rationale:
- `Work` = things that change during a shift.
- `Customers` = people and the offers attached to them.
- `Catalog` = merchandising (the things you sell).
- `Operations` = governance (the business itself).

The Dashboard demoting to `Operations` is intentional — it is a management view, not a cashier tool.

### 2.3 Page headers

`PageHeader` is **not rendered** on `/transactions`, yet it is rendered on every other admin route. This drops the breadcrumb anchor on the most-used page. All routes should share a single page-chrome contract:

```
┌ title ─────── inline-KPI chip ──────── right-aligned primary actions ┐
│ description (optional, terse)                                         │
└───────────────────────────────────────────────────────────────────────┘
```

Transactions needs: store switcher moved into the header slot, shift clock chip beside it, and a permanent “Draft” counter.

### 2.4 Breadcrumbs

Absent. Order Detail and Create Order currently rely on a stand-alone **Back to Orders** outline button. Replace with a one-line breadcrumb: `Orders / #BSD/26032026/1`. Less real estate, stronger orientation.

---

## 3 · Per-page findings

Pages are ordered by operational priority (how much time staff spend on them) rather than route alphabetical.

### 3.1 `/transactions` — POS workspace · **P0**

**What it is today:** Two-pane: left catalog (store switcher → Services / Add-ons tabs → search → tile grid), right checkout (cart, campaign, payment, notes, Review Checkout). Mobile collapses to catalog + floating cart bar + bottom sheet.

**What works:**
- Two-pane structure is correct for desktop POS.
- “Reset” top-right of cart, `CAMPAIGN` / `PAYMENT` mini-tabs are tight.
- Indonesian currency format (`Rp 49.223`) is consistent.

**What breaks:**
1. **No page title, no store chip, no cashier identity in the shell.** A cashier 9 hours into a shift wants *persistent confirmation* of which store and register they are on. Right now the only hint is inside the catalog card.
2. **Tile grid is 3-column at 1440** with wide padding — could comfortably fit 4 or 5 tiles. Density matters for a catalog with ~20+ services.
3. **Tiles carry text only** (name + price). No icon, no duration estimate, no category band. Cashier brain has to read every label.
4. **No keyboard shortcuts.** High-volume POS expects `1–9` to jump categories, `/` to focus search, `⏎` to submit checkout. Current UI is mouse-only.
5. **Cart-is-empty state** just says “Cart is empty.” Should prompt the next action (e.g., “Select a customer · tap a service to add”).
6. **“Review Checkout”** is disabled without explanation when validation fails. No inline hint of which requirement is missing (customer? store? at least one line?).
7. **Mobile 390:** no cart mini-bar visible at top — so there is no way for the cashier to see cart total until they scroll. Needs a persistent sticky bar.

**Redesign direction:**
- Promote **store + shift + cashier** into a thin status strip above catalog and cart — persistent, informational.
- Increase catalog density: 4-col ≥1280, 3-col 768–1279, 2-col <768. Tiles compress to 2-line label (name above, price below, muted category tag top-right).
- Add quick-add keyboard bindings; show the binding on the tile corner in a tiny mono chip.
- Add a *cart bottom-strip* on all viewports (not only mobile): subtotal · line count · “Review” — so the moment-to-moment status is always in view.
- Checkout sheet: state validation inline (“Select a customer to continue”) instead of greying the button silently.

### 3.2 `/worker` — Worker Queue · **P0**

**What works:**
- Status tabs are the right filter to promote (`All active · Queued · In Progress · QC · Ready for Pickup`).
- Queue cards show status color, assignment, order code, service name, item details.
- Infinite scroll + barcode scan is the right loop.

**What breaks:**
1. **Admin users have to choose a store on every visit.** Cashiers and workers are already auto-seeded to their first assigned store (`worker.index.tsx:128-146`) — only the admin path is missing. Add an “All stores” option for admins and persist their last choice in the search params (already url-backed) so a refresh doesn’t reset it.
2. **Empty state renders the filter card AND ghost skeleton rows simultaneously.** Either show filters OR show “Select a store.” Both together is noise.
3. **Date range** lives on its own row under the status tabs, visually orphaned. Group with the search input (“filter refiners”).
4. **No age signal.** The whole point of a priority queue is “oldest first” — the UI does not show how long an item has been at its current status. Add `Waiting 2h 14m` muted text under the status chip, color-coded above a threshold.
5. **No bulk action.** Marking five items “Ready for Pickup” after a batch comes off the line requires five clicks. Add multi-select with a floating action bar.
6. **Scan Tag button** is visual-equal to Find button — it should be the *primary* affordance on tablet (that’s the workflow). Swap their prominence.

**Redesign direction:**
- Two-column: left persistent status rail (same tabs but vertical), right priority-sorted list.
- Top of each card: order code · priority · *elapsed-in-stage* chip · status · assignee.
- Add per-card inline actions: `Next stage →` button that advances through the SLA (Queued → In Progress → QC → Ready). Avoids detail dive for the 80 % path.

### 3.3 `/orders` — Orders list · **P1**

**What works:**
- Status + Payment chips are the right data points and are color-coded.
- Pickup Radar side sheet is a smart pattern for “what needs to leave today.”
- Pagination is clear.

**What breaks:**
1. **Only 5 columns.** A cashier scanning orders expects: *date, total, items count*. All three are missing.
2. **Pickup Radar sheet is too narrow** — status chip truncates to “Ready for P”, store to “Fresclean B…”. Widen to `max-w-md` or restructure rows.
3. **Search is manual submit.** Debounce to 300 ms and drop the Search button.
4. **No sort indicators.** Headers look clickable but aren’t.
5. **Date filter is a `Pick a date range` ghost pill** — low affordance; fits quieter in a compact segmented quick-range control (`Today · Yesterday · 7 days · Custom`).
6. **No bulk action, no export.** For month-end reconciliation, admins need at least CSV export.

**Mobile 390:** the table forces horizontal scroll because of the `min-w-[720px]` rule; status and payment chips fall off the right edge. Either:
- Swap table for a card list below md breakpoint (each order = 3-row card with code · customer / store · status/payment/total), **or**
- Allow hide-on-small column priority so Status and Payment stay visible and Store hides first.

### 3.4 `/orders/new` — Create Order · **DROP (owner decision)**

Owner call: remove the route. It duplicates `/transactions`, sees little real use, and is admin-only. Tracked in §6 Phase 1.

Before removal: audit inbound links (`<Link to="/orders/new">` in the sidebar `masterDataNavigation` — actually not present there — and the **“+ Add Order”** button on `/orders`). Replace the Add Order CTA with a direct link to `/transactions`. Delete the route file, the `orders.new.tsx` module, and any server-only form components it owns. No redirect needed — the button is the only traversal path.

### 3.5 `/orders/:orderId` — Order Detail · **P1**

**What works:**
- Strong top summary (order code · customer · store · date · status + payment chips · totals with refunded line).
- `Mark order completed (0)` explicit disabled state + reason copy is clear.
- Service cards with photos + timeline + refund panel is a powerful view.

**What breaks:**
1. **Native file input** (“Choose File No file chosen”) inside a polished app. Replace with a `react-dropzone`-style button + drag target + preview thumb.
2. **Broken image tiles** in dev (S3 presigned issue). Add a fallback `<img onError>` → initials placeholder with the photo index number. Never show a broken-image glyph to operators.
3. **Progress-bar visual** under `Ready/Active/Picked up/Remaining` is a 1-px grey rule — hard to perceive as “bar.” Either make it a segmented bar (colored per bucket) or remove it.
4. **“Items by stage” collapsed by default.** For multi-item orders this is the single best view of where each item is; open by default when > 1 line.
5. **Refund flow complexity.** “Select all refundable / Clear” + per-service checkbox + per-item reason + per-item note is heavy. Consider a modal dedicated to Refund (Review → Confirm) so the default detail page stays readable.
6. **Refunded line in Totals** is ambiguous — is `Net Rp 336.383 − Refund Rp 135.924 = what the business keeps?` Restate as: `Paid after refund Rp 200.459` as the most-prominent number.
7. **Timeline collapsed, no “now” anchor.** Expand by default; invert order (newest on top); render each entry as `[time]  state  ←  who`. Add a “now” divider between latest entry and current state.

### 3.6 `/reports` — Daily Report · **P1**

**What works:**
- Clear time-zone label `DATE (ASIA/JAKARTA)`.
- Four KPIs are the right first cut (Revenue, Items, Orders In, Orders Out).
- Concise helper text (“Paid minus refunded”) resolves the main ambiguity.

**What breaks:**
1. **Just four numbers.** No distribution, no trend, no comparison. Management needs at minimum:
   - Revenue split by service category (stacked bar).
   - Orders In vs Out over the last 14 days (dual line or divergent bars).
   - Top 5 services by count today.
2. **No store drill.** The store filter exists but it’s just a filter; a store-comparison view (small multiples) is more useful.
3. **No export / snapshot.** Owners will want to send a daily PDF to a WhatsApp group.
4. **No auto-refresh** on a page titled “Daily Report.”

### 3.7 Admin CRUD (`/customers`, `/services`, `/products`, `/categories`, `/payment-methods`, `/stores`, `/users`, `/campaigns`, `/shifts`) · **P2**

All nine views share a template (header + filter + table + add/edit sheet). Shared findings:

| Issue | Detail | Fix |
| - | - | - |
| Horizontal scroll on mobile | `min-w-[720px]` applied universally. | Card-list fallback below `md:` or responsive column priority. |
| No delete except Campaigns | Assumes soft delete via `is_active`? Not documented. | At minimum surface a disabled “Delete” with tooltip “Use Inactive instead.” |
| Manual search submit | Expectation is debounced. | Debounce + drop the button. |
| No column sorting | Tables look sortable. | Add sort where the repository supports it. |
| Null cells inconsistent | `-`, `—`, blank all co-exist. | Single rule: em-dash `—` in muted-foreground for null. |
| Edit sheets close without dirty-confirm | Closing discards work silently. | Confirm dialog if form `isDirty`. |

Per-page specifics:

- **Customers** — missing `order count`, `last visit`, `lifetime spend`. Add as two extra columns hideable on small screens. Phone should be click-to-call, email click-to-mail.
- **Services** — COGS visible to Admin is good. Add margin % derived column. `Queue` column shows `Standard` for every row (seed artifact?) — if all services share one queue tier, drop the column.
- **Products** — `Stock` is plain number; color-code below threshold (red < 20, amber < 50). Add SKU quick-copy.
- **Categories** — uses lorem ipsum in the seed; fine for dev. Consider hiding Description if empty.
- **Payment Methods** — only five rows, flat list is fine. Add optional icon for each method (Cash, QRIS, BCA, GoPay, OVO) — this is one of the few places iconography genuinely aids recognition.
- **Stores** — only four rows; consider swapping to a 2×2 card grid. Each card holds phone, address (missing today), active order count, map pin.
- **Users** — username, role, store assignment is sufficient. Add `Last login`. Password reset is in-sheet but there is no visibility toggle; add a `Show` button.
- **Campaigns** — combine Discount / Discount Value into one `Discount` column (`"50 %"` or `"Rp 25.000"`). Show `Min order` / `Max discount` as one stacked cell `min Rp 120 000 · max Rp 30 000`. Delete button matches Edit visually — tint it `text-destructive`.
- **Shifts** — duration badge is only color-hinted when an open shift exists. Add *total hours per day* summary row, and allow admin to edit or close a rogue open shift.

### 3.8 `/auth/login` — Sign In · **P2**

**What works:** clean centered card, focused task.

**What breaks:**
1. No brand mark. The app has a Fresclean POS word-mark in the sidebar; the login sees nothing. Add a centered logotype above the card.
2. No image, no atmosphere. For an internal-but-branded POS, a subtle sidebar illustration or a cover of the physical store would go a long way.
3. No version / environment chip in the corner. Useful on tablets where cashiers may not know which install they are on.

### 3.9 `/track` — Public order tracking · **P0 (brand risk, owner-confirmed customer surface)**

Owner call: `/track` is the canonical customer-facing page. Treat it as a separate design zone — it is the **only surface customers ever see**, so it can (and should) feel different from the admin shell.

**What breaks:**
1. No Fresclean brand at all — no logo, no color, no footer.
2. No hero copy. “Track Order” title alone — no reassurance (“Masukkan kode order yang kami kirim via WhatsApp.”).
3. No language support. Customer base is Indonesian; copy is English. Ship Bahasa as default with an EN toggle, or mirror system language.
4. Order code format not explained. The placeholder `e.g. #ABC/06032026/1` helps, but most customers will paste whatever WhatsApp gave them.
5. No support fallback. If the lookup fails the customer is stuck.
6. No outbound share. A successful track result should be shareable back to a customer’s partner (“sudah selesai, diambil yuk”).
7. No tracking link issued on order creation. Today the cashier has to verbally direct customers to the URL.

**Redesign direction (customer-zone, distinct from admin aesthetic):**
- Separate layout: no sidebar, no role chrome. Full-bleed hero.
- Above-the-fold: Fresclean word-mark + one-line promise (“Lacak sneaker kamu.”) + the form, centered.
- Form copy in Bahasa with EN toggle. `Kode Order` / `Nomor WhatsApp`.
- Illustrated 4-step indicator below form (empty state): `Diterima · Dibersihkan · Quality Check · Siap Ambil`. Each stage has a small Phosphor icon.
- Results view: the same indicator but with the current stage highlighted, plus per-service cards with photo thumbnails (when available) and timestamps in human-readable Bahasa.
- Help fallback below results: `Ada pertanyaan? Hubungi cabang` → expands to per-store WhatsApp deep links.
- Support a `?code=...&phone=...` query-param so cashiers can generate a pre-filled link to drop into WhatsApp at checkout.
- This is the one place **hue is allowed** — a warm off-white hero with a single accent (mint, as §5.2). Keeps the admin surface pure while giving customers a recognizable brand moment.

---

## 4 · Cross-cutting IA proposals

### 4.1 Resolve the `/orders/new` vs `/transactions` duplication · **DECIDED**

Owner call: **drop `/orders/new` entirely.** Single order-creation surface is `/transactions`.

Work required (Phase 1):
1. Replace the `+ Add Order` button on `/orders` with a link to `/transactions`.
2. Delete route file `apps/web/src/routes/_admin/orders.new.tsx`.
3. Delete the `features/orders/components/order-form.tsx` (and its hook) if it is not reused elsewhere — grep first.
4. Run `bun run generate-routes` to regenerate the router tree.
5. Update `apps/web/src/routes/_admin/route.tsx` `pageMeta` map to drop the `/orders/new` entry.

### 4.2 Dashboard as the owner cockpit · **DECIDED**

Owner call: `/` is for the owner, not the cashier. Because workers and cashiers each have a dedicated primary route (`/worker`, `/transactions`), the index can stop trying to serve three roles at once and become a **strategic** view.

**Role-based landing** (enforce in `auth/login` redirect + `_admin/route.tsx` beforeLoad):

| Role | Lands on | Fallback nav link |
| - | - | - |
| Worker | `/worker` | Queue only |
| Cashier | `/transactions` | + Orders, Customers |
| Admin / owner | `/` (new Dashboard) | Full sidebar |

Login already does role-based redirect at `auth/login.tsx:55` (worker → `/worker`, else `/`). Extend it: cashier → `/transactions`.

**New Dashboard content (owner-strategic):**

```
┌ Top KPIs (today, yesterday, % delta) ─────────────────────────────────┐
│   Revenue · Orders in · Orders out · Queue depth · Refund rate        │
├ Per-store comparison ─────────────────────────────────────────────────┤
│   Small multiples: one card per store, mini revenue bar + live queue  │
├ Service profitability ────────────────────────────────────────────────┤
│   Top services by revenue + margin this week                          │
├ Risk strip ───────────────────────────────────────────────────────────┤
│   Oldest open order · Unclaimed >30d · Low-stock products · Expired   │
│   campaigns about to hit                                               │
└───────────────────────────────────────────────────────────────────────┘
```

`/reports` stays as the drill-through: same numbers, pick a date range, pick a store, chart it, export CSV.

Both views share a single backend aggregate endpoint; the Dashboard always asks for `today` with a `yesterday` comparison, Reports asks for whatever the user selects.

### 4.3 Shift Clock out of the sidebar

Currently `ShiftClockCard` lives in the sidebar footer. It is a **shift status** widget, not navigation. Move it to the page-header strip (top-right). Benefits: fixes §2.1 overflow; the clock is visible on every page without depending on sidebar state (mobile offcanvas hides it entirely today).

### 4.4 Search UX standard

Pick one and enforce:

| Pattern | Use |
| - | - |
| Debounced `onChange`, 300 ms, cancel on blur | All lookup tables |
| Explicit submit button | None |

Current mix creates muscle-memory churn (Queue uses explicit, Services uses none, Orders uses explicit).

### 4.5 Status-chip taxonomy

Two orthogonal states are in play — order-level (`Created · Processing · Ready for Pickup · Completed · Canceled`) and payment (`Paid · Unpaid · Refunded`). They are rendered as same-shape chips, which blurs their meaning.

Propose:
- **Order state** → solid-fill chip (high visual weight, rectangular).
- **Payment state** → outline pill (lighter, pill radius acceptable here).

Add a single `status.ts` that maps state → tone and is used by every view.

---

## 5 · Visual / design-system proposals

This is the portion the caller asked for under “Full IA + redesign proposals.” It is opinionated and depends on brand direction. **No code is changed until approved.**

### 5.1 Typography · **DECIDED**

Keep rigidity (owner). Two families, each with a sharp role:

| Family | Role | Source |
| - | - | - |
| **JetBrains Mono Variable** | Numerics, codes, identifiers, table cells where column alignment matters. Stays the “operational voice” of the product. | already installed (`@fontsource-variable/jetbrains-mono`) |
| **General Sans Variable** | Everything else — titles, labels, body prose, button text. Rigid geometric sans, open source, no curved warmth that would clash with the monospace. | Fontshare / self-hosted `@fontsource-variable/general-sans` |

Rejected alternatives: `Inter` (overused, owner’s global CLAUDE.md explicitly avoids it), `Space Grotesk` (too warm / too 2021), `Neue Machina` (commercial), `Söhne` (commercial).

**Variable registration (Tailwind v4 / `@theme inline`):**

```css
@import "@fontsource-variable/jetbrains-mono";
@import "@fontsource-variable/general-sans";

@theme inline {
  --font-mono: "JetBrains Mono Variable", ui-monospace, monospace;
  --font-sans: "General Sans Variable", ui-sans-serif, system-ui;
}
```

Then drop `font-sans` from the `body` base style (it currently resolves to mono — that is the whole problem) and **apply mono explicitly** on numeric surfaces: `.tabular`, `th`, `td[data-numeric]`, `.font-mono`.

**Scale:**

```
display  32/40  General Sans   600  tracking -0.01em
h1       24/32  General Sans   600
h2       20/28  General Sans   600
h3       14/20  General Sans   600  uppercase tracking 0.12em (section labels)
body     14/22  General Sans   400
mono     13/20  JetBrains Mono 500  (codes, amounts)
caption  11/16  General Sans   500  uppercase tracking 0.18em
```

Amounts always render mono with `tabular-nums`. Order codes render mono. Customer names, campaign names, service names render in General Sans — they read faster.

### 5.2 Color · **DECIDED**

Owner call: keep neutral admin chrome. Hue only where a **state** justifies it.

The admin app stays grayscale. Primary actions, nav, cards, tables, headers — all neutral. No brand-hue wash on the chrome.

**Semantic palette (the only hues in the admin):**

```css
/* existing tokens, kept */
--success      oklch(0.72 0.18 150);  /* Paid, Ready for Pickup, Active */
--destructive  oklch(0.58 0.22 27);   /* Refunded, Delete, Unpaid */

/* new or promoted to first-class */
--warning      oklch(0.82 0.16 80);   /* Priority queue items, due-soon */
--info         oklch(0.62 0.12 235);  /* Assigned-to-me, informational */
--neutral      var(--muted-foreground); /* Standard, Archived */
```

Usage map:

| Surface | Rule |
| - | - |
| CTA button (`variant="default"`) | Neutral — `bg-primary` (near-black) |
| Status chip | Hue from the semantic mapping only |
| Priority queue card | `border-warning/40 bg-warning/5` — **this already exists** (`worker.index.tsx:830`). Keep. Standardize the `/5 /40` opacity rule across the app. |
| Dashboard KPI delta | `text-success` when up, `text-destructive` when down |
| Campaign row | `text-muted-foreground` + `Expired` chip once the new state lands |

**Single place `/track` may break the rule:** the customer-facing hero gets a warm cream canvas + one mint accent. See §3.9.

Chart ramp (`--chart-1..5`) stays blue and is now actually used by Dashboard / Reports small multiples.

### 5.3 Density and spacing

- Introduce a **density toggle** in settings (Compact / Comfortable). POS defaults Compact; Admin defaults Comfortable.
- Table rows tighten from `h-10` to `h-9` on Compact; chips lose 2 px of vertical padding.
- Transactions tile grid drops from 3 col to 4 col in Compact at ≥1280.

### 5.4 Radius / border character

Current rule in `AGENTS.md` is **rigid, squared-off**. That stands. Codify:

- `rounded-none` everywhere **except**: status chips (`rounded-sm`), avatar / image thumbs (`rounded-sm`), popover / sheet (`rounded-none`).
- Shadow is reserved for floating surfaces only (popover, sheet). Cards are outlined, not elevated.

### 5.5 Iconography

Keep Phosphor. Standardize on `duotone` weight for navigation, `regular` for inline actions. Currently mixed.

---

## 6 · Phased roadmap

Phases are sized for a one-engineer sprint. Every owner decision from §7 is baked in.

### Phase 1 — unblock & kill duplication (1–2 days)

Goal: stop losing actions, kill dead code, fix the shell.

1. **Shell fix** — move `ShiftClockCard` out of the sidebar footer into a page-header strip; verify the Transactions nav item is visible at 1440 / 1024 / 390. (§2.1, §4.3)
2. **Drop `/orders/new`** — delete route, its `OrderForm` feature module, and update `pageMeta` + the `+ Add Order` button on `/orders` to link to `/transactions`. Regenerate TanStack Router tree. (§4.1)
3. **Table responsive fix** — drop `min-w-[720px]`; responsive column priority or card-list below `md:`. (§3.3, §3.7)
4. **File-input styling** — replace the native file control on Order Detail. (§3.5 item 1)
5. **Dirty-form confirm** — block close-with-dirty on all Edit sheets. (§3.7)
6. **Role-based login redirect** — cashiers land on `/transactions` (not `/`). (§4.2)

### Phase 2 — POS ergonomics (the workstation) (2–3 days)

7. **Status strip on Transactions** — persistent store · cashier · shift chip in the page header. (§3.1)
8. **Catalog density** — 4-col ≥ 1280, 3-col 768–1279, 2-col < 768. Tiles: name + price + muted category pill. (§3.1)
9. **Keyboard shortcuts** — `/` focus search, `1-9` jump categories, `⏎` review checkout. (§3.1)
10. **Cart bottom-strip** — sticky, all viewports. Subtotal · line count · Review. (§3.1)
11. **Queue card age-in-stage chip + bulk advance + vertical status rail.** (§3.2)
12. **Orders list columns** — add date, total, items count; quick-range segmented control replaces the date-pill. (§3.3)
13. **Search debounce everywhere** — remove the explicit Search buttons. (§4.4)

### Phase 3 — owner Dashboard + Reports (3–4 days)

14. **New Dashboard** per §4.2 — KPIs with yesterday delta, per-store small multiples, service profitability, risk strip.
15. **Reports charts** — category revenue stacked bar, 14-day Orders In/Out, Top 5 services today, CSV export. (§3.6)
16. **Sidebar IA reshuffle** (Work / Customers / Catalog / Operations). (§2.2)
17. **Status taxonomy** — extract `status.ts` helpers + enforce chip shape rules. (§4.5)

### Phase 4 — campaigns expired state + CRUD polish (2–3 days)

18. **Campaign `expired` state** — server schema + UI. Per §7 item 5, soft-delete only. Introduce a `Show expired` toggle on the list. Filter UI moves from `all / active / inactive` to `active · expired · all`.
19. **Standardize soft-delete semantics** on all other entities: `is_active` toggle with a `Show archived` view. Never expose hard delete.
20. **CRUD polish** — delete-matches-edit visual weight fix, null-cell rendering rule, column sort, responsive card fallback.

### Phase 5 — typography + `/track` customer brand (3–5 days)

21. **Register General Sans Variable** + rewire `--font-sans` vs `--font-mono`. (§5.1)
22. **Apply the type scale** — `font-sans` everywhere except explicit numeric / code surfaces. Verify table alignment unchanged.
23. **Promote `--warning` + `--info`** to first-class tokens; adopt in chip variants. (§5.2)
24. **`/track` redesign** — separate layout, Bahasa default, hero, 4-step illustrated indicator, per-service photo thumbs, WhatsApp fallback, query-param pre-fill. (§3.9)
25. **Cashier tracking-link at checkout** — on order success, surface a copy-to-clipboard `/track?code=...&phone=...` link for staff to paste into WhatsApp.

---

## 7 · Decisions captured (2026-04-18)

| # | Question | Decision | Where it applies |
| - | - | - | - |
| 1 | `/orders/new` vs `/transactions` | **Drop `/orders/new` entirely.** Low usage, admin-only; `/transactions` is the single source of truth. | §3.4, §4.1, Phase 1 item 2 |
| 2 | Dashboard intent | **Owner-strategic.** Revenue trends, per-store comparison, service profitability. Cashiers land on `/transactions`, workers on `/worker`. | §4.2, Phase 3 item 14 |
| 3 | Brand direction | **Keep rigidity.** Introduce a distinct display/body sans paired with JetBrains Mono. **No global brand hue** — color reserved for semantic states only. Claude picks specifics. | §5.1, §5.2, Phase 5 |
| 4 | `/track` scope | **Customer-only surface.** Gets its own brand zone — separate from admin chrome, the single place a hue is allowed. | §3.9, Phase 5 item 24 |
| 5 | Delete semantics | **Soft-delete only.** Campaigns get a new `expired` state. Everything else uses `is_active`. Hard delete is never exposed in UI. | §3.7, §4.5, Phase 4 item 18 |
| 6 | Role-specific landing | **Confirmed.** Worker → `/worker`, Cashier → `/transactions`, Admin/owner → `/`. Wire into login redirect. | §4.2, Phase 1 item 6 |

No blockers remain. Phase 1 can start immediately. Phases 3–5 carry their own server-side work (Dashboard aggregate endpoint, campaign `expired` column, cashier tracking-link issuer) — call those out in each PR description.

