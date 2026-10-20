import { createFileRoute } from "@tanstack/react-router";
import { FormProvider } from "react-hook-form";
import { campaignsQueries } from "@/features/campaigns/api";
import { categoriesQueries } from "@/features/categories/api";
import { paymentMethodsQueries } from "@/features/payment-methods/api";
import { productsQueries } from "@/features/products/api";
import { servicesQueries } from "@/features/services/api";
import { storesQueries } from "@/features/stores/api";
import { PosSkeleton } from "@/features/transactions/components/pos-skeleton";
import { TransactionsWorkspace } from "@/features/transactions/components/transactions-workspace";
import { useTransactionsPageBootstrap } from "@/features/transactions/hooks/use-transactions-page";
import { TransactionsPageProvider } from "@/features/transactions/lib/transactions-context";

export const Route = createFileRoute("/_admin/transactions")({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(storesQueries.list()),
			context.queryClient.ensureQueryData(categoriesQueries.list()),
			context.queryClient.ensureQueryData(productsQueries.list()),
			context.queryClient.ensureQueryData(servicesQueries.list()),
			context.queryClient.ensureQueryData(paymentMethodsQueries.list()),
		]);

		const { me } = context;

		if (me.role !== "admin") {
			const firstStoreId = me.userStores[0]?.store_id;

			if (firstStoreId) {
				await context.queryClient.ensureQueryData(
					campaignsQueries.list({
						store_id: firstStoreId,
						is_active: true,
					}),
				);
			}
		}
	},
	component: TransactionsPage,
	// Past a second, the POS's outline instead of the generic placeholder.
	pendingComponent: PosSkeleton,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

function TransactionsPage() {
	const { form, isBootstrapping, pageContext } = useTransactionsPageBootstrap();

	if (isBootstrapping) {
		return <PosSkeleton />;
	}

	return (
		<FormProvider {...form}>
			<TransactionsPageProvider value={pageContext}>
				<TransactionsWorkspace />
			</TransactionsPageProvider>
		</FormProvider>
	);
}
