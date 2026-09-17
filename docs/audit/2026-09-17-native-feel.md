# Making the POS feel native — investigation

**Date:** 2026-09-17 · **Branch:** `worktree-investigate-native-feel` (off `main` @ `c620ef43`) · **Scope:** `apps/web`

Nothing changed. This is findings + a proposed order of work.

---

## The short version

The app is a well-built website that has been installed. Three things separate it from feeling like an app:

1. **It still behaves like a browser page** — the whole document scrolls, pull-to-refresh is live, long-press selects text, the status bar is a separate white strip.
2. **Tapping any input zooms the screen.** Every field is 12px; iOS zooms below 16px. This is the single loudest "this is a website" signal at the counter.
3. **Navigation is a hamburger.** A cashier's four daily destinations are two taps away behind a top-left menu, on a phone held one-handed.

The safe-area work already in the code (9 places) is **currently inert** — the viewport meta never opts in.

---

## What "native" actually decomposes into

```
                   BROWSER PAGE                  NATIVE APP
                   ─────────────────────────     ─────────────────────────
  Chrome           whole document scrolls,       fixed header + fixed tab
                   header sticky, URL bar        bar; only the middle
                   shows/hides on scroll         region scrolls

  Edges            content stops at the          content runs under the
                   system-drawn safe box         status bar / home bar,
                                                 padding pushes it clear

  Reach            menu at TOP-LEFT              destinations at BOTTOM

  Input            tap field → page zooms        tap field → nothing moves

  Gestures         pull down → page reloads      pull down → your refresh,
                   long press → text select      or nothing

  Motion           cross-fade, same both ways    push left / pop right
```

---

## Findings, riskiest first

### 1. Inputs zoom the page on tap — iOS

- **At the counter:** cashier taps the customer phone field, the whole screen jumps to ~133% and stays there. Every form, every search box, the login screen.
- **Evidence:** live computed style on `/auth/login` → `font-size: 12px`. Source: `apps/web/src/components/ui/input.tsx:13` (`text-xs` and `md:text-xs`). Same `text-xs` appears in 53 places across `components/ui/`.
- **Why:** iOS Safari/WKWebView zooms to fit any focused control whose computed font-size is under 16px. Standalone PWAs are not exempt.
- **Fix:** raise the *control* font to 16px on coarse pointers only — the component already has the `pointer-coarse:` variant wired for height (`h-10 pointer-coarse:h-11`), so `text-xs pointer-coarse:text-base` is the same pattern. Desktop density is untouched.
- **Do not** reach for `maximum-scale=1, user-scalable=no` — it kills pinch-zoom for everyone and Safari partly ignores it anyway.
- **Effort:** small. Touches `input`, `textarea`, `select` trigger, `combobox` trigger.

### 2. `viewport-fit=cover` is missing — all safe-area padding resolves to 0

- **At the counter:** on an iPhone the installed app renders inside a system-drawn box with a plain white strip at the top; it never reaches the edges the way a real app does.
- **Evidence:** live `meta[name=viewport]` → `width=device-width, initial-scale=1.0`. No `viewport-fit`. Meanwhile `env(safe-area-inset-*)` is used in 9 places:
  - `components/app-shell.tsx:236,242`
  - `features/transactions/components/cart-mini-bar.tsx:49`
  - `features/orders/components/queue-service-detail.tsx:367`
  - `features/orders/components/photo-lightbox.tsx:167,184`
  - `features/orders/components/photo-capture-dialog.tsx:20,111`
  - `components/ui/date-picker.tsx:174`
- **Why it matters:** without `viewport-fit=cover`, `env(safe-area-inset-*)` is `0px` everywhere. That code is doing nothing today.
- **Fix:** `viewport-fit=cover` in the meta. Status bar style **stays `default`**.
- **Correction (2026-09-17, from the simulator).** An earlier draft of this report recommended `apple-mobile-web-app-status-bar-style: black-translucent` alongside it. That is wrong for this app: `black-translucent` renders the clock, wifi and battery in white over your own content, and the mobile header is white in light mode (`bg-background/95`, `--background: oklch(1 0 0)`). The time would disappear for any cashier not in dark mode. There is no way to force dark status-bar glyphs with that setting.
- **What `viewport-fit=cover` alone buys, in standalone:** `env(safe-area-inset-bottom)` becomes 34px, so the sticky footers can run their background to the physical edge while keeping text clear of the home indicator. The top stays managed by iOS, which is the safe outcome.
- **Measured on an iPhone 16 Pro simulator:** in Safari all four insets read `0px` *even with* `viewport-fit=cover`, because Safari's own chrome already occupies those regions. The insets only go non-zero in standalone — so this change is invisible in a browser tab by design, and can only be checked from an installed app.
- **Effort:** one meta line + an install check.

### 3. No bottom navigation — the daily four are behind a hamburger

- **At the counter:** cashier on a phone reaches top-left to switch between Transactions and Queue, dozens of times a shift.
- **Evidence:** `components/app-shell.tsx:236` — the mobile header is `SidebarTrigger` + logo only. `components/ui/sidebar.tsx:179` — mobile renders the sidebar as an off-canvas `Sheet`.
- **This is feasible because the role lists are short** (`components/app-navigation.ts`):

  | Role    | Destinations                                                    | Tab bar? |
  | ------- | --------------------------------------------------------------- | -------- |
  | worker  | Attendance, Transactions, Queue, Orders, Complaints              | 5 — fits |
  | cashier | + Customers, Campaigns                                            | 4 + More |
  | admin   | 14 across four groups                                             | keep sidebar |

- **Fix:** a bottom tab bar under `md:` for cashier/worker built from the same `navGroupsForRole` data, capped at 4 + a "More" sheet that reuses the existing sidebar content. Admin on a phone keeps the hamburger.
- **Effort:** medium. One new component + a branch in `AppShell`. No routing changes.

### 4. Pull-to-refresh and rubber-band are live

- **At the counter:** a cashier scrolling an order list on Android pulls slightly too far and the app **reloads mid-order**. On iOS the page rubber-bands and shows grey behind the app.
- **Evidence:** live computed `body` → `overscroll-behavior-y: auto`. No `overscroll-behavior` anywhere in `src`.
- **Fix:** `overscroll-behavior: none` on `html, body` in `index.css`. Scroll containers that *should* trap their own overscroll already do it locally (`cart-mini-bar.tsx:63`).
- **If you want pull-to-refresh back**, add it deliberately on list screens rather than leaving the browser's version.
- **Effort:** one line, plus a decision on whether to build a real refresh gesture.

### 5. The whole document scrolls instead of a fixed shell

- **At the counter:** in a browser tab the URL bar slides in and out on every scroll, so the header height changes under the thumb. In standalone it's less visible, but the header still isn't pinned the way an app's is.
- **Evidence:** `routes/__root.tsx:31` — `<main className="min-h-dvh">` in normal flow; `app-shell.tsx:236` header is `sticky`, `:242` content section is in flow.
- **Fix:** `h-dvh` shell, `overflow-hidden` on the wrapper, header and (future) tab bar fixed, one `overflow-y-auto overscroll-contain` scroll region in the middle.
- **Knock-on:** `scrollRestoration: true` in `main.tsx:76` restores *window* scroll. With a scroll container it needs to target that element instead, or restoration silently stops working.
- **Effort:** medium, and it's the change most likely to surface layout bugs on long screens. Worth doing after 1–4.

### 6. Long-press pops the text-selection magnifier on app chrome

- **At the counter:** press-and-hold on a nav label or a status badge and iOS offers Copy / Look Up — something no app does.
- **Evidence:** live computed `body` → `user-select: auto`. `index.css:167-173` sets `-webkit-tap-highlight-color: transparent` and `touch-action: manipulation` on `button, [role=button], a` — good, but not selection or callout. The photo viewer already does this locally (`photo-stage.tsx:620`, `hold-to-confirm-button.tsx:102`), which shows the pattern.
- **Fix:** `user-select: none` + `-webkit-touch-callout: none` on chrome (header, nav, buttons, labels), with `user-select: text` restored on content that staff legitimately copy — order codes, phone numbers, customer names, receipts.
- **Careful:** blanket `user-select: none` on `body` would stop a cashier copying an order code. Opt-in on chrome, not opt-out on content.
- **Effort:** small, but needs a list of "copyable" surfaces first.

### 7. Navigation transitions are direction-blind

- **At the counter:** opening an order and going back look identical — both cross-fade. Nothing tells you whether you went deeper or came back.
- **Evidence:** `main.tsx:77` sets `defaultViewTransition: true`, so the browser runs its default cross-fade. There is **no** `::view-transition-*` CSS anywhere in `src` — grep for `view-transition` returns nothing.
- **Fix:** `::view-transition-old/new` keyframes in `index.css` — slide-in-from-right on push, slide-out-to-right on pop, keyed off a direction attribute set on navigation. Gate on `prefers-reduced-motion`.
- **Reality check:** Safari 18+ supports same-document view transitions, so iOS gets this too. Cheap, high perceived payoff.
- **Effort:** small-medium.

### 8. No iOS launch screen

- **At the counter:** tapping the home-screen icon shows a blank white flash before the app paints. Android generates a splash from the manifest; iOS does not.
- **Evidence:** live `link[rel="apple-touch-startup-image"]` count → **0**.
- **Fix:** generated `apple-touch-startup-image` links per device size. `vite-plugin-pwa` can emit these via its assets generator rather than hand-authoring a dozen `<link>`s.
- **Effort:** small, mostly asset generation.

### 9. Manifest is missing the cheap native affordances

- **Evidence:** `vite.config.ts:16-63`.
- **Missing:**
  - `shortcuts` — long-press the app icon → "New order" / "Queue". Pure manifest, no code.
  - `launch_handler: { client_mode: "focus-existing" }` — tapping the icon returns to the open session instead of a fresh instance.
  - `display_override: ["standalone", "minimal-ui"]` — a graceful floor rather than falling straight to `browser`.
- **Effort:** trivial, all config.

### 10. Toasts land top-right

- **At the counter:** "Payment recorded" appears in the far corner from the thumb and, on a phone, over the sticky header.
- **Evidence:** `routes/__root.tsx:25` — `position="top-right"`.
- **Fix:** bottom-centre on coarse pointers, keep top-right on desktop. Native apps put transient confirmation near the thumb.
- **Effort:** trivial.

---

## Already right — leave alone

- `defaultPreload: "intent"` (`main.tsx:74`) — destinations prefetch on touch/hover. This is most of why navigation feels quick.
- `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation` on interactive elements (`index.css:167-173`) — kills the blue flash and the 300ms double-tap delay.
- `pointer-coarse:h-11` sizing on controls — touch targets are already handled.
- `dvh`/`svh` used consistently; no `100vh` anywhere in `src`.
- `navigateFallbackDenylist: [/^\/api\//]` — orders and payments never come from cache. Correct and load-bearing.
- `RoutePending` skeleton + TanStack's 1s pending delay — no spinner flash on fast navigations.
- Offline banner + `networkMode: "always"` on mutations — a payment tapped offline fails now, not later.
- **Haptics stay off on iOS.** Closed in #114 — the `web-haptics` hidden-switch click dismissed every Base UI popup. Not a gap; do not reopen.

---

## Suggested order

| # | Slice | Findings | Risk |
| - | ----- | -------- | ---- |
| 1 | Input zoom + meta tags + overscroll + toast position | 1, 2, 4, 10 | Low — needs a notched-device eyeball for the safe-area sites that go live |
| 2 | Manifest extras + iOS launch screens | 8, 9 | None |
| 3 | Bottom tab bar for cashier/worker | 3 | Medium — new component, no routing change |
| 4 | Directional view transitions | 7 | Low |
| 5 | Fixed shell with a single scroll region | 5 | Highest — touches every screen + scroll restoration |
| 6 | Selection/callout lockdown | 6 | Low, but needs the copyable-surface list first |

Slice 1 alone removes the two loudest tells.

---

## Not verified

- **No authenticated screenshots.** I have no dev login, so I checked `/auth/login` in the browser and read the rest from source. Findings 3, 5 and 10 are code-verified but not eyeballed on a real signed-in screen.
- **Finding 1 is now confirmed on real hardware.** An iPhone 16 Pro simulator reports `pointer: coarse = true`, `maxTouchPoints = 5`, so the `pointer-coarse:` rules do fire on iOS. Chromium's device emulation does not set touch (`maxTouchPoints: 0`), which is why it cannot be used to check this.
- **Finding 2's visual result is still unverified.** Safe-area insets only go non-zero in standalone, and this machine has `simctl` but no `Simulator.app` (Xcode 27 ships the GUI separately), so nothing here can Add to Home Screen. Needs one install on a real iPhone.
- **No authenticated screenshots**, so the 9 padding sites have still never been seen firing.
