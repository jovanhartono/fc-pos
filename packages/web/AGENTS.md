# Web Package Standards

## Stack

- React 19, Vite 7, TypeScript, Tailwind v4
- TanStack Router (file-based), TanStack Query, TanStack Table
- react-hook-form + `@hookform/resolvers` (zodResolver) + Zod
- Zustand for global UI state (dialog, sheet, auth, preferences)
- shadcn (base-lyra style) + `@base-ui/react` primitives, Phosphor Icons, Sonner toasts
- Hono RPC client (`rpc` / `rpcWithAuth`) for typed API calls via `@fresclean/api`

## Project Structure

```
src/
├── components/ui/       # shadcn components (do not hand-roll primitives)
├── components/form/     # Shared form field components (CurrencyInput, PhoneNumberField)
├── features/<domain>/   # Feature modules (components/, hooks/)
├── lib/                 # api.ts, rpc.ts, query-options.ts, form-errors.ts, utils.ts
├── routes/              # TanStack Router file-based routes
├── shared/              # Shared Zod schemas
└── stores/              # Zustand stores
```

---

## Forms

Use **react-hook-form** + **zodResolver** + **useMutation** for every form.

### FormProvider / useFormContext (no prop drilling)

Wrap forms with `FormProvider` so nested field components access form state via `useFormContext()`. Never pass `control`, `handleSubmit`, `register`, `errors`, or `isSubmitting` as individual props.

```tsx
// Parent: wrap with FormProvider
const form = useForm<MyFormValues>({
  resolver: zodResolver(mySchema),
  defaultValues,
});

return (
  <FormProvider {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <MyFieldGroup />
      <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
    </form>
  </FormProvider>
);

// Child: read via useFormContext
const MyFieldGroup = () => {
  const { control, formState: { isSubmitting } } = useFormContext<MyFormValues>();

  return (
    <Controller
      name="name"
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor="name" asterisk>Name</FieldLabel>
          <Input {...field} id="name" disabled={isSubmitting} />
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
};
```

### Mutation integration

Pair every form with `useMutation`. The global `QueryClient` in `main.tsx` handles success toasts (from `response.message`) and error toasts automatically -- only add per-mutation `onSuccess`/`onError` when extra behavior is needed (invalidation, close sheet, navigate).

```tsx
const createMutation = useMutation({
  mutationFn: createEntity,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.entities });
    closeSheet();
  },
});

const onSubmit: SubmitHandler<FormValues> = async (values) => {
  await createMutation.mutateAsync(values);
};
```

### Field components

Use `Field`, `FieldLabel`, `FieldError`, `FieldGroup` from `@/components/ui/field` for form layout. Use `Controller` for non-native inputs (Select, Combobox, Switch). Use `useFieldArray` for dynamic lists. Use `useWatch` for reactive derived values.

### Zod schemas

Schemas can come from `@fresclean/api/schema` or be defined locally. Extend with `.extend()` / `.superRefine()` as needed. Place shared frontend-only schemas in `src/shared/zod.ts`.

---

## No Props Drilling

- Use `useFormContext()` for form state in nested components
- Use Zustand selectors for global UI state (`useDialog`, `useSheet`, `useAuthStore`)
- Use React context when a subtree needs shared non-global state (e.g. a view-model pattern for complex pages)
- If a component needs more than 5-6 props, extract a context provider or Zustand store

### Zustand selector pattern

Always use selectors -- never destructure the whole store:

```tsx
// Correct
const closeDialog = useDialog((state) => state.closeDialog);
const { open, title } = useDialog((state) => state.dialogState);

// Wrong -- subscribes to all state changes
const store = useDialog();
```

---

## Lean Components

- **Route files** are thin orchestrators: define loaders, search param validation, wire up queries/mutations, render feature components. Do not put large form/table/dialog logic inline.
- **Feature components** live in `src/features/<domain>/components/` -- one responsibility per file.
- **Custom hooks** (`use-*.ts`) in the feature folder for complex stateful logic.
- Extract inline subcomponents from route files into their own files under the feature directory.

---

## UI Components (shadcn)

- Use existing components from `src/components/ui/` -- never hand-roll primitives that shadcn provides.
- Add new shadcn components via `bunx shadcn@latest add <component>`.
- shadcn config: `base-lyra` style, `@base-ui/react` primitives, Phosphor icons, neutral base color.
- Use `GlobalDialog` / `GlobalSheet` via Zustand (`openDialog` / `openSheet`) for CRUD modals -- pass content as `ReactNode`.

---

## Data Fetching

### API layer

- API functions (`fetch*`, `create*`, `update*`, `delete*`) live in `src/lib/api.ts`.
- Query keys are defined as `queryKeys` in `src/lib/api.ts`.
- Query options are defined in `src/lib/query-options.ts` using `queryOptions()`.
- RPC client setup in `src/lib/rpc.ts`: `rpc` (unauthenticated) and `rpcWithAuth()` (reads JWT from Zustand).

### Route loaders

Loaders prefetch data into the query cache -- they do not return data directly. Components then read from cache via `useQuery`.

```tsx
export const Route = createFileRoute("/_admin/stores")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(storesQueryOptions()),
  component: StoresPage,
});

// In the component
const storesQuery = useQuery(storesQueryOptions());
```

### Mutations

- Use `useMutation` with `mutationFn` from `api.ts`.
- Invalidate relevant query keys in `onSuccess`.
- Global error/success handlers in `main.tsx` cover most cases.

---

## State Management

- **Zustand** for global UI state: `useDialog`, `useSheet`, `useAuthStore`, `useTransactionPreferencesStore`.
- **Zustand `persist`** middleware for data that survives page reloads (JWT token, user preferences).
- **React context** for theme (`ThemeProvider`), sidebar (`SidebarProvider`), and scoped subtree state.
- No Redux, no MobX.

---

## Routing

- TanStack Router with file-based routes under `src/routes/`.
- `_admin` layout route with `beforeLoad: requireAuth`.
- Search params validated with Zod via `validateSearch`.
- Use `Route.useSearch()` and `Route.useParams()` in components.
- Pass `queryClient` in router context for loader access.

---

## Toasts

Use `sonner` via `toast.success()` / `toast.error()`. The global mutation handler in `main.tsx` auto-toasts `response.message` on success and error messages on failure -- only call `toast` manually for non-mutation feedback.
