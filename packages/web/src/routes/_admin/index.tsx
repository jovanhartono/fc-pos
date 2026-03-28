import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
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
	const { data, isPending, isFetching } = useQuery(dashboardQueryOptions());

	return (
		<>
			<PageHeader
				title="Dashboard"
				actions={
					<Badge variant={isFetching ? "secondary" : "outline"}>
						{isFetching ? "Refreshing" : "Live"}
					</Badge>
				}
			/>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{cards.map((card) => (
					<Card key={card.key}>
						<CardHeader className="pb-3">
							<CardDescription>{card.label}</CardDescription>
							<CardTitle className="text-2xl">
								{isPending ? "..." : (data?.[card.key] ?? 0)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-xs text-muted-foreground">Total records.</p>
						</CardContent>
					</Card>
				))}
			</div>
		</>
	);
}
