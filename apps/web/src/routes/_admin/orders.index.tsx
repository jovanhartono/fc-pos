import { orderNetTotal } from "@fresclean/api/rules";
import { Invoice01Icon, Store01Icon } from "@hugeicons/core-free-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { z } from "zod";

import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { EmptyState } from "@/components/empty-state";
import { ListPanel } from "@/components/list-panel";
import { MoneyValue } from "@/components/money-value";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { CustomerLink } from "@/features/customers/components/customer-link";
import { ordersQueries } from "@/features/orders/api";
import type { FetchOrdersQuery, Order } from "@/features/orders/api";
import { ItemsProgress } from "@/features/orders/components/items-progress";
import { NotifiedLabel } from "@/features/orders/components/notified-label";
import { PaymentBadges } from "@/features/orders/components/order-badges";
import { OrderFilters } from "@/features/orders/components/order-filters";
import type { OrderFilterValues } from "@/features/orders/components/order-filters";
import { OrderPhoneRow } from "@/features/orders/components/order-phone-row";
import { useOrderSheet } from "@/features/orders/hooks/use-order-sheet";
import {
  NOTIFIED_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  REFUND_STATUS_VALUES,
} from "@/features/orders/lib/order-filter-values";
import { paymentMethodsQueries } from "@/features/payment-methods/api";
import { storesQueries } from "@/features/stores/api";
import { useStoreScope } from "@/features/users/hooks/use-store-scope";
import { pickStore, storeScope } from "@/features/users/lib/store-scope";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatListDate } from "@/lib/dayjs";
import {
  DEFAULT_PAGE_SIZE,
  pageSizeChange,
  pageSizeSearch,
} from "@/lib/page-size";
import type { PageSize } from "@/lib/page-size";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";

const ordersSearchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  limit: pageSizeSearch,
  search: z.string().trim().min(1).max(100).optional().catch(undefined),
  storeId: z.coerce.number().int().positive().optional().catch(undefined),
  status: z.enum(ORDER_STATUS_VALUES).optional().catch(undefined),
  paymentStatus: z.enum(PAYMENT_STATUS_VALUES).optional().catch(undefined),
  paymentMethodId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .catch(undefined),
  refundStatus: z.enum(REFUND_STATUS_VALUES).optional().catch(undefined),
  notified: z.enum(NOTIFIED_VALUES).optional().catch(undefined),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional()
    .catch(undefined),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional()
    .catch(undefined),
  paidFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional()
    .catch(undefined),
  paidTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional()
    .catch(undefined),
  // The Order open in the sheet over the list, on a tablet or desktop.
  open: z.coerce.number().int().positive().optional().catch(undefined),
});

const buildOrdersListParams = (
  filters: OrderFilterValues & { page: number; limit?: PageSize },
  storeId?: number
): FetchOrdersQuery => {
  const pageSize = filters.limit ?? DEFAULT_PAGE_SIZE;
  return {
    limit: pageSize,
    offset: (filters.page - 1) * pageSize,
    ...(filters.search ? { search: filters.search } : {}),
    ...(storeId === undefined ? {} : { store_id: storeId }),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.paymentStatus ? { payment_status: filters.paymentStatus } : {}),
    ...(filters.paymentMethodId
      ? { payment_method_id: filters.paymentMethodId }
      : {}),
    ...(filters.refundStatus ? { refund_status: filters.refundStatus } : {}),
    ...(filters.notified ? { notified: filters.notified } : {}),
    ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
    ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
    ...(filters.paidFrom ? { paid_from: filters.paidFrom } : {}),
    ...(filters.paidTo ? { paid_to: filters.paidTo } : {}),
  };
};

const columnsFor = (
  orderLink: (orderId: number) => LinkProps
): DataTableColumnDef<Order>[] => [
  {
    accessorKey: "code",
    header: "Order code",
    meta: { width: { percent: 16, minRem: 9 } },
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <div className="flex gap-x-1">
          {row.original.has_complaint ? (
            <span className="text-footnote text-destructive">Complaint</span>
          ) : null}
          <Link
            {...orderLink(row.original.id)}
            className="font-medium tabular-nums"
          >
            {row.original.code}
          </Link>
        </div>
        <span className="text-caption font-normal text-muted-foreground">
          {row.original.store_name}
        </span>
      </div>
    ),
  },
  {
    id: "created_at",
    header: "Created at",
    meta: { width: { percent: 11, minRem: 6.25 } },
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatListDate(row.original.created_at)}
      </span>
    ),
  },
  {
    accessorKey: "customer_name",
    header: "Customer",
    meta: { width: { percent: 25, minRem: 9 } },
    cell: ({ row }) => (
      <div>
        <span className="flex items-baseline gap-x-1.5">
          <CustomerLink
            className="line-clamp-2 min-w-0"
            customerId={row.original.customer_id}
            name={row.original.customer_name}
          />
          {row.original.notified ? (
            <NotifiedLabel className="shrink-0" />
          ) : null}
        </span>
        <span className="block text-footnote whitespace-nowrap text-muted-foreground tabular-nums">
          {row.original.customer_phone}
        </span>
      </div>
    ),
  },
  {
    id: "items_ready",
    header: "Items ready",
    meta: { width: { percent: 11, minRem: 6 } },
    cell: ({ row }) => (
      <ItemsProgress
        done={row.original.items_ready}
        total={row.original.items_total}
      />
    ),
  },
  {
    accessorKey: "status",
    header: "Fulfillment",
    meta: { width: { percent: 14, minRem: 8 } },
    cell: ({ row }) => (
      <Badge variant={getOrderStatusBadgeVariant(row.original.status)}>
        {formatOrderStatus(row.original.status)}
      </Badge>
    ),
  },
  {
    accessorKey: "payment_status",
    header: "Payment",
    meta: { width: { percent: 11, minRem: 6.25 } },
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        <PaymentBadges order={row.original} />
      </div>
    ),
  },
  {
    id: "total",
    header: "Total",
    meta: { align: "right", width: { percent: 12, minRem: 6.5 } },
    cell: ({ row }) => <MoneyValue value={orderNetTotal(row.original)} />,
  },
];

const OrdersPage = () => {
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  const storesQuery = useQuery(storesQueries.list());
  const scope = useStoreScope();

  // A phone opens an Order as its own page; a tablet or desktop opens it in a
  // sheet over the list.
  const isWide = !useIsMobile();
  const sheetOrderId = isWide ? search.open : undefined;
  // Replace, not push: walking twenty Orders with J must not leave twenty
  // steps for Back to undo before it leaves the page.
  const handleOpenOrder = (orderId: number) => {
    void navigate({
      search: (prev) => ({ ...prev, open: orderId }),
      replace: true,
    });
  };
  const orderLink = (orderId: number): LinkProps =>
    isWide
      ? {
          from: Route.fullPath,
          search: (prev) => ({ ...prev, open: orderId }),
          replace: true,
        }
      : { to: "/orders/$orderId", params: { orderId: String(orderId) } };
  const handleCloseOrder = () =>
    navigate({
      search: (prev) => ({ ...prev, open: undefined }),
      replace: true,
      resetScroll: false,
    });

  const handleFilterChange = (patch: Partial<OrderFilterValues>) => {
    void navigate({
      replace: true,
      search: (prev) => ({ ...prev, page: 1, ...patch }),
    });
  };

  const parsedStoreId = search.storeId;
  // Admin and non-admin build the same params once a store is chosen; the only
  // gap — non-admin with no store — never runs (gated by `enabled` below). The
  // Filters count uses it too, so it always matches the list Apply shows.
  const ordersQueryFor = (filters: typeof search) =>
    !scope.isAdmin && filters.storeId === undefined
      ? undefined
      : buildOrdersListParams(filters, filters.storeId);
  const orderQuery = ordersQueryFor(search);

  const canListOrders = scope.isAdmin || parsedStoreId !== undefined;

  const ordersQuery = useQuery({
    ...ordersQueries.list(orderQuery),
    enabled: canListOrders,
    placeholderData: keepPreviousData,
  });

  const orders = ordersQuery.data?.items ?? [];

  useOrderSheet({
    isReady: ordersQuery.data !== undefined,
    onClose: handleCloseOrder,
    onSelect: handleOpenOrder,
    openId: sheetOrderId,
    orders,
  });

  const columns = columnsFor(orderLink);

  const pager = (
    <TablePagination
      meta={ordersQuery.data?.meta}
      isLoading={ordersQuery.isPending}
      onPageChange={(page) => {
        void navigate({
          replace: true,
          search: (prev) => ({
            ...prev,
            page,
          }),
        });
      }}
      pageSize={search.limit ?? DEFAULT_PAGE_SIZE}
      onPageSizeChange={(limit) => {
        void navigate({
          replace: true,
          search: (prev) => ({ ...prev, ...pageSizeChange(limit) }),
        });
      }}
    />
  );

  return (
    <>
      <PageHeader title="Orders" />
      <ListPanel>
        <OrderFilters
          values={search}
          scope={scope}
          onChange={handleFilterChange}
          listQueryFor={(picks) =>
            ordersQueryFor({ ...search, ...picks, page: 1 })
          }
        />
        {scope.allowedStoreIds?.length === 0 ? (
          <EmptyState icon={Store01Icon}>No store assigned</EmptyState>
        ) : (
          <DataTable
            emptyIcon={Invoice01Icon}
            columns={columns}
            data={orders}
            isLoading={ordersQuery.isPending || storesQuery.isPending}
            isStale={ordersQuery.isPlaceholderData}
            filterKey={JSON.stringify(orderQuery)}
            noMatch={{
              noun: "Orders",
              search: search.search,
              onClear: () => handleFilterChange({ search: undefined }),
            }}
            getRowLink={(order) => orderLink(order.id)}
            isRowActive={(order) => order.id === sheetOrderId}
            renderCard={(order) => (
              <OrderPhoneRow
                isActive={order.id === sheetOrderId}
                link={orderLink(order.id)}
                order={order}
              />
            )}
            footer={pager}
          />
        )}
      </ListPanel>
    </>
  );
};

export const Route = createFileRoute("/_admin/orders/")({
  validateSearch: (search) => ordersSearchSchema.parse(search),
  // A cashier or worker only sees their own store's Orders, so the store is
  // picked before the page draws instead of the list loading twice.
  beforeLoad: ({ context, search }) => {
    if (search.storeId !== undefined) {
      return;
    }
    const storeId = pickStore(storeScope(context.me));
    if (storeId !== undefined) {
      throw redirect({
        to: "/orders",
        search: { ...search, storeId },
        replace: true,
      });
    }
  },
  // Opening an Order in the sheet over the list must not re-run the list's loader.
  loaderDeps: ({ search: { open: _open, ...listSearch } }) => listSearch,
  loader: async ({ context, deps, cause }) => {
    // A new filter, page or search keeps the list on screen and swaps the rows
    // in place; only opening the page waits for them.
    if (cause === "stay") {
      return;
    }
    const canListOrders =
      deps.storeId !== undefined || storeScope(context.me).isAdmin;
    const listParams = buildOrdersListParams(deps, deps.storeId);

    await Promise.all([
      context.queryClient.ensureQueryData(storesQueries.list()),
      context.queryClient.ensureQueryData(paymentMethodsQueries.list()),
      canListOrders
        ? context.queryClient.ensureQueryData(ordersQueries.list(listParams))
        : undefined,
    ]);
  },
  component: OrdersPage,
  // Past a second, the page itself draws with skeleton rows.
  pendingComponent: OrdersPage,
});
