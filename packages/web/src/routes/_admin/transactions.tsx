import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionsWorkspace } from "@/features/transactions/components/transactions-workspace";
import { useTransactionsPage } from "@/features/transactions/hooks/use-transactions-page";
import {
	campaignsQueryOptions,
	categoriesQueryOptions,
	currentUserDetailQueryOptions,
	customersQueryOptions,
	paymentMethodsQueryOptions,
	productsQueryOptions,
	servicesQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import { getCurrentUser } from "@/stores/auth-store";

export const Route = createFileRoute("/_admin/transactions")({
	loader: async ({ context }) => {
		const currentUser = getCurrentUser();

		await Promise.all([
			context.queryClient.ensureQueryData(storesQueryOptions()),
			context.queryClient.ensureQueryData(categoriesQueryOptions()),
			context.queryClient.ensureQueryData(productsQueryOptions()),
			context.queryClient.ensureQueryData(servicesQueryOptions()),
			context.queryClient.ensureQueryData(paymentMethodsQueryOptions()),
		]);

		if (!currentUser) {
			return;
		}

		const currentUserDetail = await context.queryClient.ensureQueryData(
			currentUserDetailQueryOptions(currentUser.id),
		);

		if (currentUser.role !== "admin") {
			const firstStoreId = currentUserDetail.userStores[0]?.store_id;

			if (firstStoreId) {
				await context.queryClient.ensureQueryData(
					campaignsQueryOptions({
						store_id: firstStoreId,
						is_active: true,
					}),
				);
			}
		}
	},
	component: TransactionsPage,
});

function TransactionsPage() {
	const viewModel = useTransactionsPage();

	if (viewModel.isBootstrapping) {
		return (
			<div className="grid gap-4">
				<Card>
					<CardContent className="py-8 text-sm text-muted-foreground">
						Loading POS workspace...
					</CardContent>
				</Card>
			</div>
		);
	}

	return <TransactionsWorkspace viewModel={viewModel} />;
}
