# Web Package Standards

`@fresclean/web` — React 19, Vite, TanStack (Router/Query/Table), shadcn, Zustand. Repo-wide rules: `../../AGENTS.md`

## UI Preferences

- Terse, operational copy. No marketing/guiding prose. Short labels and empty states.
- Apple-style look: white page (`bg-background`), content on white rounded cards with a hairline border (`rounded-lg border bg-card`), controls `rounded-sm` and white (`bg-background`) even inside a card, Inter. Colours come from the iOS system palette tokens in `src/index.css` — never hard-code a hex in a component.
- Selection is Apple blue, never black: a selected card gets `ring-2 ring-primary bg-primary/[0.06]`, a selected button or step `bg-primary text-primary-foreground`, a count a `rounded-full bg-primary` pill.
- Chips and filter strips are pills: `rounded-full bg-secondary`, the selected one `bg-primary`; a count inside is regular weight at 60% opacity.
- Options that all fit at 390px with no scrolling and no counts use the segmented control (blue selected segment); anything that would scroll, carries counts, or comes from data (POS categories) uses the pill strip.
- Bars (progress, sparklines, leaderboards) are thin and rounded: `h-1.5 rounded-full`, track `bg-soft-bar-track`, fill `bg-primary`, `bg-success` when complete.
- Type comes from one Apple scale in `src/index.css`: `text-caption` 11, `text-footnote` 12, `text-subhead` 13, `text-body` 14, `text-headline` 15, `text-title-3` 17, `text-title-2` 20, `text-title-1` 26, `text-large-title` 34, plus `text-field` (16px, a field on touch so iOS doesn't zoom) — never a pixel size or Tailwind's default sizes. A new name goes in `cn()`'s list in `src/shared/utils.ts` too.
- Controls share one height: `h-9` on desktop, `pointer-coarse:h-11` on touch, `text-subhead` text. A call site sets its own height only for a deliberate exception, and then sets the `pointer-coarse:` height too.
- Badges are `rounded-full` with soft tinted fills and no border; pick a `Badge` variant rather than building a chip by hand. Tabs use the shadcn `Tabs` (iOS segmented control).
- A list row that opens a record opens from anywhere on it: pass `getRowLink` to `DataTable`, and its title stays black. A link to somewhere else — the customer on an order, a code in a sheet — is blue with `text-link`.
- A list of Orders that isn't a table uses `OrderListRow`: customer name on line 1 (customers remember their name, not their code), the code leading line 2. Codes are Inter with `tabular-nums`, never mono.
- Hugeicons, free Stroke Rounded set: `<HugeiconsIcon icon={Search01Icon} />`, icons from `@hugeicons/core-free-icons`. Add a `size-*` class only where no parent sizes the svg; Button, Badge, menus and Select already do. Pick the icon that fits the place, not the nearest name match. There is no filled style, so the active tab is shown by its blue colour alone.
- Row actions are icon-only buttons side by side, no `⋯` menu; a card's status badge sits at the row's end; a card title never truncates.
- Every empty list or section is `EmptyState` (`components/empty-state.tsx`): an icon naming what's missing (the page's sidebar icon where it has one), a short line, an optional action. It draws its own card, and drops it by itself inside a sheet or a `Card`; pass `isInset` only inside another bordered box (a table, a hand-built card). `DataTable` takes `emptyIcon`. Lines in popups and one-tile-tall form slots stay plain text.
- Dense filters → dialogs/sheets on small screens; tabs for high-frequency filters.
- Fonts are hand-written latin-only `@font-face` in `src/index.css` on purpose; don't swap back to a Fontsource import or add latin-ext.
- Check a UI change in the browser at 1280px and 390px before calling it done.

## UI Gotchas

- Base UI `PopoverTrigger render={<div/>}` requires `nativeButton={false}` or it warns at runtime.
- Biome a11y: `role="button"` on span/div is disallowed (use a real `<button>`); `role="combobox"` requires `aria-expanded`.
- Base UI `Select` inside a `Popover`: items register on first Select open, so `SelectValue` shows the raw `value` string until then. Use function-child mapper `<SelectValue>{(v) => label(v)}</SelectValue>` or swap to `Combobox` (which keeps label via `items` prop).
- iPhone Safari ignores `position: relative` on `<tr>`: a row-wide tap overlay escapes the row and freezes scroll. Anchor it with a transform on the row instead.
- A height-capped inner list hands scroll to the page at its ends — no `overscroll-contain` on it.

## Structure

- `components/ui/` — shadcn (Base UI style) only, add via `bunx shadcn@latest add <component>`
- `features/<domain>/` — `api.ts`, `components/`, `hooks/`; `routes/` stay thin orchestrators
- `stores/` — Zustand stores, one `<name>-store.ts` each
- "Transactions" (`features/transactions/`, `/transactions`, `transactions-store.ts`) is the POS's legacy name: say Order or POS in new code, and rename when work touches these files.

## Forms

react-hook-form + zodResolver + useMutation for every form.

- Wrap with `FormProvider`; children use `useFormContext()`. Never prop-drill `control`/`errors`/`isSubmitting`.
- The global `QueryClient` shows success/error toasts. Add `onSuccess`/`onError` only to invalidate, close a sheet, navigate, or silence the toast where the form already reports it (`onError: () => undefined`) — a mutation's own callback replaces the global one, it doesn't add to it.
- Fields use `Field`, `FieldLabel`, `FieldError` from `@/components/ui/field`.
- Schemas from `@fresclean/api/schema` or local to the feature. Do not re-implement the server's field builders.
- `StoreSelect` (`features/orders/components/`) reused across features. For filter UIs pass `allOptionLabel="All stores"` — prepends `{ value: "", label }` sentinel so `""` = unscoped.

## Photos

Every photo upload flow — drop-off, Item photos, pickup, future entry points — must reuse `PhotoUploadDialog` (`features/orders/components/photo-upload-dialog.tsx`). Pass an `uploadPhoto({ file, contentType, note })` callback wiring presign → upload → save. The dialog owns camera capture, file picker, and in-dialog preview. Cards/sections own only the trigger button and the saved-photo preview. **Do not** inline `<input type="file">` or build a one-off upload dialog.

Every saved/uploaded image rendered anywhere must be clickable and open in `PhotoLightbox` (`features/orders/components/photo-lightbox.tsx`). Single images use a 1-item array; collections pass the full list + `initialIndex` for swipe/keyboard navigation. Do not build a one-off image preview dialog.

## Data Fetching

- One module per domain: `src/features/<domain>/api.ts` exports `<domain>Keys`, `<domain>Queries` (each entry a `queryOptions` / `infiniteQueryOptions`), the mutation functions, and the domain's types. Nothing about a domain's endpoints lives outside it.
- Keys: `all` → `lists()` → `list(query)` → `detail(id)`, so one prefix invalidates every screen the domain owns.
- Transport helpers (`parseSuccessData`, `toSearchParams`, `toPaginated`, uploads) in `src/lib/http.ts`; shared staleTimes in `src/lib/query-defaults.ts`.
- RPC: `rpcWithAuth()` (JWT) and `rpc` from `src/lib/rpc.ts`; `rpcPublic` from `src/lib/rpc-public.ts` for endpoints nobody signs in for, and only that one keeps `/track` free of the sign-in code.
- Loaders prefetch into cache via `ensureQueryData`; components read via `useQuery`.
- Mutations: `useMutation` + invalidate in `onSuccess`. A write that several screens react to gets a named function in `src/lib/cache-events.ts` — one site, so no caller can forget a screen.

## State

- Zustand for global UI (`useDialog`, `useSheet`, `useAuthStore`), read through selectors, never a destructured whole store: `useDialog(s => s.closeDialog)`. `persist` for reload-surviving data.
- React context for theme, sidebar and scoped subtree state. Past 5–6 drilled props, reach for context or a store.
- The service worker stays (push is planned) in `registerType: "autoUpdate"` mode: a new build takes over as soon as it's downloaded, with no toast. Never import `virtual:pwa-register`, which reloads the page on takeover and wipes a cashier mid-order.

## Dialogs

- Every confirm, form-in-a-modal or info dialog opens through `useDialog().openDialog({ title, description, content, footer })`, which `GlobalDialog` renders. Sheets do the same through `useSheet().openSheet`. Copy an existing call: the Campaign Archive confirm (`routes/_admin/campaigns.tsx`) or the order sheet actions (`order-identity-strip.tsx`).
- An Order opens as its full page (`/orders/$orderId`) or in the global sheet (`useOrderSheet`, `useOpenNestedOrder`), never a side pane.
- There is no AlertDialog, so don't add one back with the shadcn CLI. A destructive confirm is `openDialog` with Cancel plus a destructive button in `footer`. Import `@/components/ui/dialog` directly only for the media dialogs that need their own frame (photo capture, `PhotoLightbox`).

## Routing

- File-based under `src/routes/`; `_admin` layout with `beforeLoad: requireAuth`
- Search params validated with Zod via `validateSearch`
- `bun run type-check` regenerates the route tree before `tsc -b`, so a new or renamed route file needs no separate step.
- A tab, filter, search or page change navigates with `replace: true`, so an iPhone swipe back leaves the page instead of stepping through filters. The Track page lookup is the exception.
- A link inside a sheet that leaves the page takes `onClick={useLeaveSheetLink()}`: Safari's swipe-back picture otherwise keeps the sheet open in it.
- Preload is `intent` by default; `preload="viewport"` only on the home launcher, tab bar and sidebar.

## Dates

- Server date params (`from`, `to`, `date`) are `YYYY-MM-DD`: `dayjs(x).format("YYYY-MM-DD")` or `DatePicker`/`DateRangePicker`, never `.toISOString()`.
- dayjs runs without the `isoWeek` plugin. Monday-start weeks step back by hand: `(dayjs().day() + 6) % 7` (see `src/shared/date-presets.ts`).
