import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerOrdersCard } from "@/features/customers/components/customer-orders-card";
import { CustomerSummaryStrip } from "@/features/customers/components/customer-summary-strip";
import {
	customerDetailQueryOptions,
	ordersPageQueryOptions,
} from "@/lib/query-options";

const ORDERS_PAGE_SIZE = 10;

const customerDetailSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
});

const CustomerDetailSkeleton = () => (
	<div className="grid gap-4">
		<Skeleton className="h-28 w-full" />
		<Skeleton className="h-24 w-full" />
		<Skeleton className="h-72 w-full" />
	</div>
);

const CustomerDetailPage = () => {
	const { customerId } = Route.useParams();
	const { page } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const id = Number(customerId);

	const customerQuery = useQuery(customerDetailQueryOptions(id));

	if (customerQuery.isPending) {
		return <CustomerDetailSkeleton />;
	}

	if (!customerQuery.data) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-muted-foreground text-sm">
					Customer not found
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid gap-4">
			<CustomerSummaryStrip customer={customerQuery.data} />
			<CustomerOrdersCard
				customerId={id}
				page={page}
				onPageChange={(next) =>
					navigate({ search: (prev) => ({ ...prev, page: next }) })
				}
			/>
		</div>
	);
};

export const Route = createFileRoute("/_admin/customers/$customerId")({
	validateSearch: (search) => customerDetailSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, params, deps }) => {
		const id = Number(params.customerId);

		if (!(Number.isInteger(id) && id > 0)) {
			return;
		}

		await Promise.all([
			context.queryClient.ensureQueryData(customerDetailQueryOptions(id)),
			context.queryClient.ensureQueryData(
				ordersPageQueryOptions({
					customer_id: id,
					limit: ORDERS_PAGE_SIZE,
					offset: (deps.page - 1) * ORDERS_PAGE_SIZE,
				}),
			),
		]);
	},
	component: CustomerDetailPage,
});
