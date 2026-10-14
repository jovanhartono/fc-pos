import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { STRIP_FADE, TAB_STRIP_ROW } from "@/components/chip-strip";
import { PageHeader } from "@/components/page-header";
import { counterQueries } from "@/features/counter/api";
import { DayCloseTab } from "@/features/counter/components/day-close/day-close-tab";
import { NeedsALookSection } from "@/features/counter/components/needs-a-look-section";
import { PickupShelfSection } from "@/features/counter/components/pickup-shelf-section";
import { WorkshopSection } from "@/features/counter/components/workshop-section";
import { OrderSheet } from "@/features/orders/components/order-sheet";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { storesQueries } from "@/features/stores/api";
import { usersQueries } from "@/features/users/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type CounterTab = "now" | "day-close";

const TABS: { id: CounterTab; label: string }[] = [
	{ id: "now", label: "Now" },
	{ id: "day-close", label: "Day close" },
];

interface CounterPageProps {
	date?: string;
	onDateChange: (date: string | undefined) => void;
	onStoreChange: (storeId: number) => void;
	onTabChange: (tab: CounterTab) => void;
	storeId?: number;
	tab: CounterTab;
}

interface CounterTabsProps {
	activeTab: CounterTab;
	onTabChange: (tab: CounterTab) => void;
}

const CounterTabs = ({ activeTab, onTabChange }: CounterTabsProps) => (
	<nav aria-label="Counter" className={STRIP_FADE}>
		<div className={TAB_STRIP_ROW} role="tablist">
			{TABS.map((tab) => {
				const isActive = activeTab === tab.id;
				return (
					<button
						aria-selected={isActive}
						className={cn(
							"relative shrink-0 whitespace-nowrap border-b-2 px-4 py-3 font-medium text-sm transition-colors",
							isActive
								? "border-foreground text-foreground"
								: "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
						)}
						id={`counter-tab-${tab.id}`}
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						role="tab"
						tabIndex={isActive ? 0 : -1}
						type="button"
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	</nav>
);

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
		return <p className="text-muted-foreground text-sm">Loading…</p>;
	}
	if (isError) {
		return (
			<p className="text-destructive text-sm">Could not load the Counter.</p>
		);
	}

	const shelfOrders = data.pickup_shelf.oldest.map((order) => ({
		id: order.order_id,
	}));

	return (
		<div className="grid gap-6 text-sm">
			<WorkshopSection categories={data.categories} workshop={data.workshop} />
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

interface CounterPanelProps {
	date?: string;
	isDayClose: boolean;
	onDateChange: (date: string | undefined) => void;
	storeId: number;
}

const CounterPanel = ({
	date,
	isDayClose,
	onDateChange,
	storeId,
}: CounterPanelProps) =>
	isDayClose ? (
		<DayCloseTab
			date={date}
			key={storeId}
			onDateChange={onDateChange}
			storeId={storeId}
		/>
	) : (
		<CounterBody key={storeId} storeId={storeId} />
	);

export const CounterPage = ({
	date,
	onDateChange,
	onStoreChange,
	onTabChange,
	storeId,
	tab,
}: CounterPageProps) => {
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
	// Workers keep the Now content only, even from a ?tab=day-close link.
	const canSeeDayClose = me?.role === "admin" || me?.role === "cashier";
	const activeTab = canSeeDayClose ? tab : "now";
	const panel = selectedStoreId ? (
		<CounterPanel
			date={date}
			isDayClose={activeTab === "day-close"}
			onDateChange={onDateChange}
			storeId={selectedStoreId}
		/>
	) : (
		<p className="text-muted-foreground">No Store.</p>
	);

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
			<div className="grid gap-6">
				{canSeeDayClose ? (
					<CounterTabs activeTab={activeTab} onTabChange={onTabChange} />
				) : null}
				{canSeeDayClose ? (
					<div
						aria-labelledby={`counter-tab-${activeTab}`}
						id="counter-panel"
						role="tabpanel"
					>
						{panel}
					</div>
				) : (
					panel
				)}
			</div>
		</>
	);
};
