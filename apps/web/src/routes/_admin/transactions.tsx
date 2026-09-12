import { createFileRoute } from "@tanstack/react-router";
import { FormProvider } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { categoriesQueries } from "@/features/categories/api";
import { paymentMethodsQueries } from "@/features/payment-methods/api";
import { productsQueries } from "@/features/products/api";
import { servicesQueries } from "@/features/services/api";
import { storesQueries } from "@/features/stores/api";
import { TransactionsWorkspace } from "@/features/transactions/components/transactions-workspace";
import { useTransactionsPageBootstrap } from "@/features/transactions/hooks/use-transactions-page";
import { TransactionsPageProvider } from "@/features/transactions/lib/transactions-context";
import { usersQueries } from "@/features/users/api";
import { campaignsQueryOptions } from "@/lib/query-options";
import { getCurrentUser } from "@/stores/auth-store";

export const Route = createFileRoute("/_admin/transactions")({
	loader: async ({ context }) => {
		const currentUser = getCurrentUser();
		const mePromise = currentUser
			? context.queryClient.ensureQueryData(usersQueries.me())
			: undefined;

		await Promise.all([
			context.queryClient.ensureQueryData(storesQueries.list()),
			context.queryClient.ensureQueryData(categoriesQueries.list()),
			context.queryClient.ensureQueryData(productsQueries.list()),
			context.queryClient.ensureQueryData(servicesQueries.list()),
			context.queryClient.ensureQueryData(paymentMethodsQueries.list()),
			mePromise,
		]);

		const me = await mePromise;

		if (me && me.role !== "admin") {
			const firstStoreId = me.userStores[0]?.store_id;

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
	const { form, isBootstrapping, pageContext } = useTransactionsPageBootstrap();

	if (isBootstrapping) {
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

	return (
		<FormProvider {...form}>
			<TransactionsPageProvider value={pageContext}>
				<TransactionsWorkspace />
			</TransactionsPageProvider>
		</FormProvider>
	);
}
