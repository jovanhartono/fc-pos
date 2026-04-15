import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { dashboardQueryOptions } from "@/lib/query-options";

export const Route = createFileRoute("/_admin/")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(dashboardQueryOptions()),
	component: DashboardPage,
});

const cards = [
	{ key: "customers", label: "Customers" },
	{ key: "users", label: "Users" },
	{ key: "stores", label: "Stores" },
	{ key: "categories", label: "Categories" },
	{ key: "services", label: "Services" },
	{ key: "products", label: "Products" },
	{ key: "paymentMethods", label: "Payment Methods" },
	{ key: "campaigns", label: "Campaigns" },
	{ key: "orders", label: "Orders" },
] as const;

function DashboardPage() {
	const { data, isPending } = useQuery(dashboardQueryOptions());

	return (
		<>
			<PageHeader title="Dashboard" />

			<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
				{cards.map((card) => (
					<Card key={card.key} size="sm">
						<CardHeader className="gap-1">
							<CardDescription className="text-xs uppercase tracking-wider">
								{card.label}
							</CardDescription>
							<CardTitle className="text-2xl tabular-nums">
								{isPending ? "…" : (data?.[card.key] ?? 0)}
							</CardTitle>
						</CardHeader>
					</Card>
				))}
			</div>
		</>
	);
}
