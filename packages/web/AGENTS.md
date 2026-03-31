# Web Package Standards

`@fresclean/web` — React 19, Vite, TanStack (Router/Query/Table), shadcn, Zustand. Repo-wide rules: `../../AGENTS.md`

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
- `lib/` — `api.ts`, `rpc.ts`, `query-options.ts`, `utils.ts`
- `routes/` — TanStack Router file-based; thin orchestrators only
- `stores/` — Zustand stores

## Forms

react-hook-form + zodResolver + useMutation for every form.

- Wrap with `FormProvider`; children use `useFormContext()`. Never prop-drill `control`/`errors`/`isSubmitting`.
- Pair every form with `useMutation`. Global `QueryClient` handles success/error toasts — only add `onSuccess`/`onError` for invalidation, close sheet, or navigate.
- Use `Field`, `FieldLabel`, `FieldError` from `@/components/ui/field`. `Controller` for non-native inputs. `useFieldArray` for lists. `useWatch` for derived values.
- Schemas from `@fresclean/api/schema` or local; shared frontend-only in `src/shared/zod.ts`.

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
