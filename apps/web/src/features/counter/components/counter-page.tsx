import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { counterQueries } from "@/features/counter/api";
import { NeedsALookSection } from "@/features/counter/components/needs-a-look-section";
import { PickupShelfSection } from "@/features/counter/components/pickup-shelf-section";
import { WorkshopSection } from "@/features/counter/components/workshop-section";
import { OrderSheet } from "@/features/orders/components/order-sheet";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { storesQueries } from "@/features/stores/api";
import { usersQueries } from "@/features/users/api";
import { useIsMobile } from "@/hooks/use-mobile";

interface CounterPageProps {
	onStoreChange: (storeId: number) => void;
	storeId?: number;
}

interface CounterBodyProps {
	storeId: number;
}

const CounterBody = ({ storeId }: CounterBodyProps) => {
	const { data, isPending, isError } = useQuery(counterQueries.detail(storeId));
	const { open } = useSearch({ from: "/_admin/counter" });
	const navigate = useNavigate({ from: "/counter" });
	// Same as the Orders list: a phone opens an Order as its own page, a
	// tablet or desktop opens it in a sheet over the Counter.
	const isWide = !useIsMobile();

	// The Counter scrolls as a whole page, so opening or closing the sheet
	// must not jump the cashier back to the top of it.
	const handleOpenOrder = useCallback(
		(orderId: number) => {
			void navigate({
				search: (prev) => ({ ...prev, open: orderId }),
				replace: true,
				resetScroll: false,
			});
		},
		[navigate],
	);
	const handleCloseOrder = useCallback(() => {
		void navigate({
			search: (prev) => ({ ...prev, open: undefined }),
			resetScroll: false,
		});
	}, [navigate]);

	if (isPending) {
		return <p className="text-muted-foreground">Loading…</p>;
	}
	if (isError) {
		return <p className="text-destructive">Could not load the Counter.</p>;
	}

	const shelfOrders = data.pickup_shelf.oldest.map((order) => ({
		id: order.order_id,
	}));

	return (
		<div className="grid gap-6">
			<WorkshopSection categories={data.categories} />
			<PickupShelfSection
				isWide={isWide}
				openOrderId={isWide ? open : undefined}
				shelf={data.pickup_shelf}
				storeId={storeId}
			/>
			<NeedsALookSection counter={data} />
			{isWide && open !== undefined ? (
				<OrderSheet
					onClose={handleCloseOrder}
					onSelect={handleOpenOrder}
					openId={open}
					orders={shelfOrders}
				/>
			) : null}
		</div>
	);
};

export const CounterPage = ({ onStoreChange, storeId }: CounterPageProps) => {
	const { data: me } = useQuery(usersQueries.me());
	const { data: stores = [] } = useQuery(storesQueries.list());

	const isAdmin = me?.role === "admin";
	const ownStoreIds = me?.userStores.map((item) => item.store_id) ?? [];
	const firstStoreId = isAdmin ? stores[0]?.id : ownStoreIds[0];
	// A link shared from another Store falls back to the worker's own Store.
	const selectedStoreId =
		storeId && (isAdmin || ownStoreIds.includes(storeId))
			? storeId
			: firstStoreId;
	const hasPicker = isAdmin || ownStoreIds.length > 1;

	return (
		<>
			<PageHeader
				actions={
					hasPicker ? (
						<div className="w-56 max-sm:w-44">
							<StoreAutocomplete
								allowedStoreIds={isAdmin ? undefined : ownStoreIds}
								hideLabel
								id="counter-store"
								onValueChange={(value) => {
									if (value) {
										onStoreChange(Number(value));
									}
								}}
								value={selectedStoreId ? String(selectedStoreId) : ""}
							/>
						</div>
					) : null
				}
				title="Counter"
			/>
			{selectedStoreId ? (
				<CounterBody key={selectedStoreId} storeId={selectedStoreId} />
			) : (
				<p className="text-muted-foreground">No Store.</p>
			)}
		</>
	);
};
