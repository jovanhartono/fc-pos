import { TransactionsCatalog } from "@/features/transactions/components/transactions-catalog";
import { TransactionsCheckout } from "@/features/transactions/components/transactions-checkout";
import type { useTransactionsPage } from "@/features/transactions/hooks/use-transactions-page";
import type { Product, Service } from "@/lib/api";

type TransactionsWorkspaceProps = {
	viewModel: ReturnType<typeof useTransactionsPage>;
};

export function TransactionsWorkspace({
	viewModel,
}: TransactionsWorkspaceProps) {
	return (
		<div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.9fr)]">
			<TransactionsCatalog
				mode={viewModel.mode}
				searchTerm={viewModel.searchTerm}
				isAdmin={viewModel.isAdmin}
				visibleStores={viewModel.visibleStores}
				selectedStoreId={viewModel.selectedStoreId}
				products={viewModel.products}
				services={viewModel.services}
				productTabs={viewModel.productTabs}
				serviceTabs={viewModel.serviceTabs}
				activeProductCategory={viewModel.activeProductCategory}
				activeServiceCategory={viewModel.activeServiceCategory}
				activeItems={viewModel.activeItems as Product[] | Service[]}
				categoryMap={viewModel.categoryMap}
				productCartQtyById={viewModel.productCartQtyById}
				serviceCartQtyById={viewModel.serviceCartQtyById}
				onSearchTermChange={viewModel.setSearchTerm}
				onStoreChange={viewModel.handleStoreChange}
				onModeChange={viewModel.setMode}
				onProductCategoryChange={viewModel.setActiveProductCategory}
				onServiceCategoryChange={viewModel.setActiveServiceCategory}
				onAddProduct={viewModel.handleAddProduct}
				onAddService={viewModel.handleAddService}
			/>
			<TransactionsCheckout
				form={viewModel.form}
				selectedStore={viewModel.selectedStore}
				cartCount={viewModel.cartCount}
				selectedPaymentMethodLabel={viewModel.selectedPaymentMethodLabel}
				selectedCampaign={viewModel.selectedCampaign}
				selectedStoreNumber={viewModel.selectedStoreNumber}
				paymentStatus={viewModel.paymentStatus}
				submitError={viewModel.submitError}
				campaignOptions={viewModel.campaignOptions}
				paymentMethodOptions={viewModel.paymentMethodOptions}
				campaignsLoading={viewModel.campaignsLoading}
				paymentMethodsLoading={viewModel.paymentMethodsLoading}
				cartProductRows={viewModel.cartProductRows}
				cartServiceRows={viewModel.cartServiceRows}
				categoryMap={viewModel.categoryMap}
				campaignDiscount={viewModel.campaignDiscount}
				discountValue={viewModel.discountValue}
				subtotal={viewModel.subtotal}
				total={viewModel.total}
				isSubmitting={viewModel.isSubmitting}
				onResetCart={viewModel.resetCart}
				onRemoveProduct={viewModel.removeProductFromCart}
				onUpdateProductQty={viewModel.updateProductQty}
				onRemoveService={viewModel.removeServiceFromCart}
				onUpdateServiceColor={viewModel.updateServiceColor}
				onUpdateServiceBrand={viewModel.updateServiceBrand}
				onUpdateServiceSize={viewModel.updateServiceSize}
				onSubmit={viewModel.handleSubmit}
			/>
		</div>
	);
}
