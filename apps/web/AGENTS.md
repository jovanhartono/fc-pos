# Web Package Standards

`@fresclean/web` — React 19, Vite, TanStack (Router/Query/Table), shadcn, Zustand. Repo-wide rules: `../../AGENTS.md`

## Commands

```bash
bun run dev             # Vite dev server (port 5173)
bun run build           # TypeScript check + production build
bun run type-check      # TypeScript check + route regeneration
bun run generate-routes # Regenerate TanStack Router route tree
```

## UI Preferences

- Terse, operational copy. No marketing/guiding prose. Short labels and empty states.
- Rigid, squared-off UI — avoid `rounded-*` unless component requires it.
- Phosphor icons with `Icon` suffix (e.g. `StarIcon`).
- Dense filters → dialogs/sheets on small screens; tabs for high-frequency filters.
- Match existing visual language; no decorative styling changes.

## Structure

- `components/ui/` — shadcn only, add via `bunx shadcn@latest add <component>`
- `components/form/` — shared form fields (CurrencyInput, PhoneNumberField)
- `features/<domain>/components/`, `features/<domain>/hooks/` — feature modules
- `hooks/` — shared hooks (`use-mobile.ts`)
- `lib/` — `api.ts`, `rpc.ts`, `query-options.ts`, `status.ts`, `utils.ts`
- `routes/` — TanStack Router file-based; thin orchestrators only
- `shared/` — shared Zod schemas (`zod.ts`) and utils (`utils.ts`)
- `stores/` — Zustand stores (auth, dialog, sheet, transaction-preferences)

## Forms

react-hook-form + zodResolver + useMutation for every form.

- Wrap with `FormProvider`; children use `useFormContext()`. Never prop-drill `control`/`errors`/`isSubmitting`.
- Pair every form with `useMutation`. Global `QueryClient` handles success/error toasts — only add `onSuccess`/`onError` for invalidation, close sheet, or navigate.
- Use `Field`, `FieldLabel`, `FieldError` from `@/components/ui/field`. `Controller` for non-native inputs. `useFieldArray` for lists. `useWatch` for derived values.
- Schemas from `@fresclean/api/schema` or local; shared frontend-only in `src/shared/zod.ts`.
- `StoreAutocomplete` (`features/orders/components/`) reused across features. For filter UIs pass `allOptionLabel="All stores"` — prepends `{ value: "", label }` sentinel so `""` = unscoped.

## Photos

Every photo upload flow — drop-off, service detail, pickup, future entry points — must reuse `PhotoUploadDialog` (`features/orders/components/photo-upload-dialog.tsx`). Pass an `uploadPhoto({ file, contentType, note })` callback wiring presign → upload → save. The dialog owns camera capture, file picker, and in-dialog preview. Cards/sections own only the trigger button and the saved-photo preview. **Do not** inline `<input type="file">` or build a one-off upload dialog.

Every saved/uploaded image rendered anywhere must be clickable and open in `PhotoLightbox` (`features/orders/components/photo-lightbox.tsx`). Single images use a 1-item array; collections pass the full list + `initialIndex` for swipe/keyboard navigation. Do not build a one-off image preview dialog.

## No Props Drilling

- `useFormContext()` for form state
- Zustand selectors (never destructure whole store): `useDialog(s => s.closeDialog)`
- React context for scoped subtree state
- Extract context/store if >5-6 props

## Data Fetching

- API functions and `queryKeys` in `src/lib/api.ts`; query options in `src/lib/query-options.ts`
- RPC: `rpc` (public) and `rpcWithAuth()` (JWT) from `src/lib/rpc.ts`
- Loaders prefetch into cache via `ensureQueryData`; components read via `useQuery`
- Mutations: `useMutation` + invalidate keys in `onSuccess`

## State

- Zustand for global UI (`useDialog`, `useSheet`, `useAuthStore`); `persist` for reload-surviving data
- React context for theme, sidebar, scoped state
- `GlobalDialog`/`GlobalSheet` via Zustand for CRUD modals

## Routing

- File-based under `src/routes/`; `_admin` layout with `beforeLoad: requireAuth`
- Search params validated with Zod via `validateSearch`
- `Route.useSearch()` / `Route.useParams()` in components
- After renaming/creating a route file, run `bun run generate-routes` before type-check. If `FileRoutesByPath` still errors, run type-check again — `tsc -b` incremental cache sometimes lags one pass.

## Dates

- Server date params (`from`, `to`, `date`) require `YYYY-MM-DD`. Use `dayjs(x).format("YYYY-MM-DD")` or the built-in `DatePicker`/`DateRangePicker` (already emit correct format).
- dayjs runs vanilla — no `isoWeek` plugin. For Mon-start weeks: `const daysFromMonday = (dayjs().day() + 6) % 7`.
