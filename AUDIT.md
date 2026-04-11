# Fresclean Project Audit

**Date:** 2026-04-09
**Scope:** Full project scan — server, web, documentation

---

## 1. Security (Server)

### CRITICAL

| # | Issue | File | Detail |
|---|-------|------|--------|
| S1 ✅ | **Any authenticated user can create admin accounts** | `routes/admin/users.ts` | No role check on POST/GET/PUT user endpoints. A worker can create an admin account. |
| S2 ✅ | **Weak validation on user creation** — drizzle-zod schema used instead of hand-crafted one | `modules/users/user.schema.ts` vs `schema/index.ts` | The actual route uses `createInsertSchema(usersTable)` which allows 1-char passwords, no confirmation. The carefully validated `POSTUserSchema` in `schema/index.ts` is unused. |
| S3 ✅ | **JWT_SECRET has no startup guard** | `middlewares/admin.ts:4`, `routes/auth.ts:66` | If `JWT_SECRET` is undefined, tokens get signed with the string `"undefined"`. No startup assertion exists. |

### HIGH

| # | Issue | File | Detail |
|---|-------|------|--------|
| S4 ✅ | **JWT tokens never expire** | `routes/auth.ts:59-68` | No `exp` claim. Deactivated users keep full access forever. |
| S5 | **`order-service-images` route is an auth bypass** | `routes/admin/order-service-images.ts` | Any JWT holder can POST/PUT/DELETE any image without order-ownership checks. |
| S6 | **S3 key accepted verbatim — cross-order photo theft** | `order-admin.service.ts:862-887` | No prefix validation. A caller can claim photos from other orders. |
| S7 | **No rate limiting on login** | `routes/auth.ts` | Open to brute-force. No rate limiter anywhere in the app. |
| S8 ✅ | **`insertUser` returns password hash** | `user.repository.ts:114-125` | The repository `returning()` includes the hash. Service strips it, but the contract leaks it. |
| S9 | **Password can never be changed** | `user.service.ts:61-75` | `updateUser` silently discards the password field. No change-password endpoint exists. |

---

## 2. Logic Flaws (Server)

### HIGH

| # | Issue | File | Detail |
|---|-------|------|--------|
| L1 ✅ | **TOCTOU race on service status transitions** | `order-admin.service.ts` (lines 650-698, 764-818) | Status is checked outside the transaction, then written inside. Two workers can claim the same item simultaneously. Fix: `UPDATE ... WHERE status = 'queued' RETURNING *`. |
| L2 ✅ | **Re-paying a paid order is allowed** | `order-admin.service.ts:592-638` | `updateOrderPayment` doesn't guard against double-pay or paying a cancelled order. |
| L3 ✅ | **All-cancelled orders become "completed"** | `order-admin.service.ts:156-200` | `recalculateOrderStatus` treats all-terminal as "completed" even when every service was cancelled. The `cancelled` order status is never set. |

### MEDIUM

| # | Issue | File | Detail |
|---|-------|------|--------|
| L4 ✅ | **Products have stock constraints but no decrement on order** | `schema.ts` (stock check constraint) vs `order.service.ts` | The schema enforces `stock >= 0` but `insertOrderProducts` never decrements stock. |
| L5 ✅ | **Public tracking fetches full data before validating phone** | `routes/public/orders.ts:28-103` | Unauthenticated users can probe order existence. Phone check should be in the DB query. |
| L6 ✅ | **`buildWhereClause` and `buildRelationalWhere` can diverge** | `order.repository.ts:52-238` | Two parallel filter implementations that must stay in sync. Search already uses slightly different patterns. |
| L7 ✅ | **Default sort order is oldest-first** | `order.schema.ts:33-34` | `sort_by: "id"`, `sort_order: "asc"` — most admin UIs expect newest-first. |

---

## 3. Performance (Server)

### MEDIUM

| # | Issue | File | Detail |
|---|-------|------|--------|
| P1 ✅ | **`getOrderServiceByItemCode` / `getOrderServiceById` not prepared** | `order-admin.service.ts:261-317` | Hot-path queue queries. The adjacent `getOrderServicePrepared` is correctly prepared. |
| P2 ✅ | **`getS3Client()` creates a new client per request** | `utils/s3.ts:21-33` | Should be a module-level singleton. |
| P3 ✅ | **`listProducts()` / `listServices()` have no pagination** | `product.repository.ts`, `service.repository.ts` | Unbounded table scans with no limit. |
| P4 ✅ | **`DATABASE_URL_DEV` hardcoded in runtime** | `db/index.ts:5` | Production would silently use the dev database. |

---

## 4. Performance (Web)

### CRITICAL

| # | Issue | File | Detail |
|---|-------|------|--------|
| W1 ✅ | **Dashboard fetches ALL entity records just to count them** | `lib/api.ts:910-944` | 9 concurrent full-table fetches, discarded after `.length`. Need a server-side counts endpoint. |

### HIGH

| # | Issue | File | Detail |
|---|-------|------|--------|
| W2 ✅ | **`ordersQueryOptions` and `ordersPageQueryOptions` share the same queryKey** | `query-options.ts:93-103` | Different response shapes with same cache key — whichever runs first poisons the cache. |
| W3 ✅ | **8 individual `useWatch` calls** in `TransactionsCheckout` | `transactions-checkout.tsx:87-125` | Consolidate into one `useWatch({ name: [...] })` to reduce re-renders. |
| W4 ✅ | **Infinite scroll observer torn down on every fetch** | `worker.index.tsx:198-221` | Observer recreated on `isFetchingNextPage` change. Should be stable. |
| W5 ✅ | **`submit` handler recreated every render, re-binds controller** | `use-transactions-page.ts:276-319` | Needs `useCallback`. |
| W6 ✅ | **No `staleTime` on any query** | `query-options.ts` (all entries) | Reference data (stores, categories, services) refetched on every mount. |

---

## 5. UI/UX (Web)

### HIGH

| # | Issue | File | Detail |
|---|-------|------|--------|
| U1 ✅ | **Loading/error states are bare `<p>` text** | `orders.$orderId.tsx:458-469`, `queue-service-detail.tsx:308-324` | No skeleton, no layout wrapper. `<Skeleton>` component exists but isn't used. |
| U2 ✅ | **Hooks called before early returns in `AdminOrderDetailPage`** | `orders.$orderId.tsx:324-453` | All mutations registered with `id = NaN` before guard checks. |
| U3 ✅ | **`PickupRadar` uses hardcoded `slate-*` colors** | `pickup-radar.tsx` (entire file) | Won't respond to dark mode. Rest of app uses semantic tokens. |
| U4 ✅ | **User edit form pre-fills password with `"placeholder1"`** | `users.tsx:165-166` | Security smell and misleading UX. Server will receive this string if user doesn't change it. |
| U5 ✅ | **No 401 interceptor — expired/invalid tokens aren't cleared** | `lib/auth.ts`, `auth-store.ts` | User with stale token passes `requireAuth` then every API call silently fails. |

### MEDIUM

| # | Issue | File | Detail |
|---|-------|------|--------|
| U6 ✅ | **`ORDER_STATUS_TRANSITIONS` duplicated in two files** | `orders.$orderId.tsx:82-106`, `queue-service-detail.tsx:51-67` | Must be changed in two places. Should import from server package or shared constant. |
| U7 ✅ | **No empty state explaining missing store assignment** | `orders.index.tsx:169-172` | Non-admin with no store sees "No data found" with no explanation. |
| U8 ✅ | **`campaigns.tsx` columns not in `useMemo`** | `campaigns.tsx:262-331` | Recreated on every render, triggering full table reconciliation. |

---

## 6. State Management (Web)

### HIGH

| # | Issue | File | Detail |
|---|-------|------|--------|
| SM1 ✅ | **`transactionsPageController` is a module-level mutable singleton** | `transactions-store.ts:89-107` | Not React-owned. Breaks on Strict Mode double-mount, fast refresh, or multiple instances. |
| SM2 ✅ | **Server-fetched data duplicated into Zustand via effects** | `transactions-store.ts:48-66`, `use-transactions-page.ts:321-352` | TanStack Query manages cache, but Zustand holds a derived snapshot. Components should read from Query directly. |
| SM3 ✅ | **`updateUserStores` called outside `useMutation`** | `users.tsx:129-132, 148-151` | Errors silently swallowed. No toast on failure. Cache invalidated even on error. |

### MEDIUM

| # | Issue | File | Detail |
|---|-------|------|--------|
| SM4 ✅ | **`useSheet`/`useDialog` stores `ReactNode`, content can't re-render** | `dialog-store.ts:8`, `sheet-store.ts:7` | Data fetched after open won't update the sheet content. |
| SM5 ✅ | **`UsersPage` prop-drills form internals** | `users.tsx:73-76, 161-188` | Violates the `FormProvider`/`useFormContext` pattern documented in AGENTS.md. |

---

## 7. Documentation Gaps

### CRITICAL — Missing Business Context

The docs describe "a laundry/cleaning service" but the codebase is actually a **sneaker/footwear cleaning and restoration POS**. None of the following is documented:

- **Domain model**: sneaker cleaning with brand/model/color/size per item
- **Order lifecycle & status state machine**: `ORDER_STATUS_TRANSITIONS`, derived order status, terminal states
- **Refund model**: line-item scoped, largest-remainder rounding for discount allocation
- **User roles & permissions**: admin/cashier/worker capabilities, store-scoped access via `user_stores`
- **Order code format**: `#STORE_CODE/DDMMYYYY/sequence`
- **Item code format**: `#CODE/DATE/SEQ-S001`
- **Discount rules**: campaign vs manual (mutually exclusive), store scoping, percentage caps
- **Photo workflow**: intake (order-level) + service photos (dropoff/progress/pickup), pickup photo required before `picked_up`
- **Public tracking**: requires order code + phone number

### Other Doc Issues

- Missing env vars: `AWS_S3_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `db/index.ts` always uses `DATABASE_URL_DEV` — docs imply runtime switching
- `packages/web/README.md` is a stale Vue 3 template readme
- `src/schema/` directory not mentioned in architecture docs
- `src/db/relations.ts` not documented — must be kept in sync with schema changes
- No mention of `src/errors.ts` custom exception classes

---

## Priority Matrix

| Priority | Items | Why |
|----------|-------|-----|
| **Now** (security) | S1, S2, S3, S4, S7 | Any worker can create admin accounts, JWT has no guard or expiry, no rate limit |
| **Soon** (correctness) | L1, L2, L3, L4, W2, SM3 | Race conditions, double-pay, wrong order status, stock not decremented, cache poisoning |
| **Next sprint** (performance) | W1, W3, W5, W6, P1-P3 | Dashboard over-fetching, transactions POS re-renders, missing staleTime, unprepared queries |
| **Ongoing** (DX/UX) | U1-U5, SM1, SM2, docs | Loading states, dark mode, password UX, transactions architecture, documentation |
