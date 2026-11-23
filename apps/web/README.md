# @fresclean/web

The staff app and public Track page for Fresclean. It is a React 19 + Vite PWA that staff install on the store tablet and their phones, built to work one-handed on a shop floor.

## What's in it

- **POS** (`/transactions`): build an Order, take payment, print the Receipt over Web Bluetooth to a thermal printer
- **Queue** (`/queue`): each Store's Items waiting for work, filtered by Category; open an Item to move it through its statuses and add photos
- **Counter** (`/counter`): one Store's state right now, with the Day close beside it
- **Orders, Customers, Complaints**: search, detail pages, pickup with the Pickup code, refunds and Rework lines
- **Reports** (`/reports`): Overview, Financial, Payments, Operations, Quality, Workers, Customers, Campaigns and the Aging queue
- **Attendance and Shifts**: clock in and out within 3 km of the Store
- **Catalog and admin**: Stores, Services, Products, Categories, Campaigns, payment methods, Users
- **Track page** (`/track`): for Customers, no login. Each Item's progress, and a QRIS code to pay what's owed

## Stack

- **Routing:** TanStack Router (file-based)
- **Data:** TanStack Query + typed RPC client from `@fresclean/api`
- **Forms:** react-hook-form + Zod (`zodResolver`)
- **State:** Zustand
- **UI:** shadcn (base-lyra), Base UI, Hugeicons, Tailwind CSS v4
- **App shell:** `vite-plugin-pwa` (installable, offline-capable), Vercel Analytics + Speed Insights

## Commands

Run from this directory (or use the root `bun run dev` to start API + web together):

```sh
bun run dev               # Vite dev server at http://localhost:5173
bun run build             # TypeScript check + production build
bun run preview           # Preview the production build
bun run type-check        # Regenerate routes + TypeScript check
bun run generate-routes   # Regenerate TanStack Router route tree
bun run test              # bun test
bun run generate-receipt-logo   # Rebuild the receipt wordmark bitmap from scripts/
```

The dev server expects the API running at port 8000 (`bun run dev` in `packages/server`). `VITE_API_BASE_URL` overrides that; `.env.production` leaves it empty so the RPC client uses same-origin `/api`.

## Notes

- Add shadcn components via `bunx shadcn@latest add <component>` into `src/components/ui/`.
- After renaming/creating a route file, run `bun run generate-routes` before type-checking.
- Conventions and structure: see [`AGENTS.md`](AGENTS.md).
