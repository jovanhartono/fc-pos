import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { ListPanel } from "@/components/list-panel";
import { customersQueries } from "@/features/customers/api";
import {
	CUSTOMER_ORDERS_PAGE_SIZE,
	CustomerOrdersCard,
} from "@/features/customers/components/customer-orders-card";
import {
	CustomerSummarySkeleton,
	CustomerSummaryStrip,
} from "@/features/customers/components/customer-summary-strip";
import { ordersQueries } from "@/features/orders/api";
import { CONTENT_FADE } from "@/lib/content-fade";
import { getCurrentUser } from "@/stores/auth-store";

const customerDetailSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
});

const CustomerDetailPage = () => {
	const { customerId } = Route.useParams();
	const { page } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const id = Number(customerId);

	const customerQuery = useQuery(customersQueries.detail(id));

	if (!(customerQuery.isPending || customerQuery.data)) {
		return <EmptyState>Customer not found</EmptyState>;
	}

	// A list page like /orders, so the Orders pager stays at the page foot
	// when the last page holds two Orders.
	return (
		<ListPanel className="gap-4">
			{customerQuery.data ? (
				<div className={CONTENT_FADE}>
					<CustomerSummaryStrip customer={customerQuery.data} />
				</div>
			) : (
				<CustomerSummarySkeleton />
			)}
			<CustomerOrdersCard
				// Another Customer never borrows the last one's Orders while theirs load.
				key={id}
				customerId={id}
				page={page}
				onPageChange={(next) =>
					navigate({ search: (prev) => ({ ...prev, page: next }) })
				}
			/>
		</ListPanel>
	);
};

export const Route = createFileRoute("/_admin/customers/$customerId")({
	validateSearch: (search) => customerDetailSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	// The page is admin-only server-side (ADR-0021). A cashier who reaches it —
	// the browse list is theirs too — would otherwise watch both reads 403 into
	// the layout's crash screen, so send them back to the list instead.
	beforeLoad: () => {
		if (getCurrentUser()?.role !== "admin") {
			throw redirect({ to: "/customers", search: { page: 1 } });
		}
	},
	loader: async ({ context, params, deps, cause }) => {
		const id = Number(params.customerId);

		// Paging through the Customer's Orders keeps the page up and swaps the rows.
		if (!(Number.isInteger(id) && id > 0) || cause === "stay") {
			return;
		}

		await Promise.all([
			context.queryClient.ensureQueryData(customersQueries.detail(id)),
			context.queryClient.ensureQueryData(
				ordersQueries.list({
					customer_id: id,
					limit: CUSTOMER_ORDERS_PAGE_SIZE,
					offset: (deps.page - 1) * CUSTOMER_ORDERS_PAGE_SIZE,
				}),
			),
		]);
	},
	component: CustomerDetailPage,
	// Past a second, the page draws its own skeleton, not the generic placeholder.
	pendingComponent: CustomerDetailPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});
