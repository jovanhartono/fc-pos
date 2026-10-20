import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { counterQueries } from "@/features/counter/api";
import { DayCloseTab } from "@/features/counter/components/day-close/day-close-tab";
import { DayRow } from "@/features/counter/components/day-close/day-row";
import {
	PendingComplaintsSection,
	PendingQcRejectsSection,
} from "@/features/counter/components/pending-sections";
import { PickupShelfSection } from "@/features/counter/components/pickup-shelf-section";
import { WorkshopSection } from "@/features/counter/components/workshop-section";
import { useJakartaToday } from "@/features/counter/hooks/useJakartaToday";
import { StoreSelect } from "@/features/orders/components/store-select";
import { useOrderSheet } from "@/features/orders/hooks/useOrderSheet";
import { storesQueries } from "@/features/stores/api";
import { usersQueries } from "@/features/users/api";
import { useIsMobile } from "@/hooks/use-mobile";

export type CounterTab = "status" | "summary";

const TABS: { id: CounterTab; label: string }[] = [
	{ id: "status", label: "Status" },
	{ id: "summary", label: "Summary" },
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
	actions?: ReactNode;
}

// Two tabs never overflow, so the row has room for the Summary's day on the
// right without scrolling.
const CounterTabs = ({ actions }: CounterTabsProps) => (
	<div className="flex items-center justify-between gap-2">
		<TabsList aria-label="Counter">
			{TABS.map((tab) => (
				<TabsTrigger key={tab.id} value={tab.id}>
					{tab.label}
				</TabsTrigger>
			))}
		</TabsList>
		{actions}
	</div>
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
			replace: true,
			resetScroll: false,
		});
	}, [navigate]);

	useOrderSheet({
		isReady: data !== undefined,
		onClose: handleCloseOrder,
		onSelect: handleOpenOrder,
		openId: isWide ? open : undefined,
		orders:
			data?.pickup_shelf.oldest.map((order) => ({ id: order.order_id })) ?? [],
	});

	if (isPending) {
		return <p className="text-muted-foreground text-body">Loading…</p>;
	}
	if (isError) {
		return (
			<p className="text-destructive text-body">Could not load the Counter.</p>
		);
	}

	return (
		<div className="grid gap-6 text-body">
			<WorkshopSection categories={data.categories} workshop={data.workshop} />
			<PickupShelfSection
				isWide={isWide}
				openOrderId={isWide ? open : undefined}
				shelf={data.pickup_shelf}
				storeId={storeId}
			/>
			<PendingComplaintsSection complaints={data.complaints} />
			<PendingQcRejectsSection rejects={data.qc_rejects} />
		</div>
	);
};

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
	// Workers keep the Status content only, even from a ?tab=summary link.
	const canSeeDayClose = me?.role === "admin" || me?.role === "cashier";
	const activeTab = canSeeDayClose ? tab : "status";
	const today = useJakartaToday();
	// A date after today, from a hand-edited link, falls back to today.
	const day = date && date < today ? date : today;
	const isSummary = activeTab === "summary" && selectedStoreId !== undefined;

	let panel = <p className="text-muted-foreground">No Store.</p>;
	if (selectedStoreId) {
		panel = isSummary ? (
			<DayCloseTab
				day={day}
				key={selectedStoreId}
				storeId={selectedStoreId}
				today={today}
			/>
		) : (
			<CounterBody key={selectedStoreId} storeId={selectedStoreId} />
		);
	}

	return (
		<>
			<PageHeader
				actions={
					hasPicker ? (
						<StoreSelect
							allowedStoreIds={isAdmin ? undefined : ownStoreIds}
							hideLabel
							id="counter-store"
							triggerClassName="sm:w-60"
							onValueChange={(value) => {
								if (value) {
									onStoreChange(Number(value));
								}
							}}
							value={selectedStoreId ? String(selectedStoreId) : ""}
						/>
					) : null
				}
				// On a phone the full Store name gets its own row under the title.
				className="max-sm:grid-cols-1 max-sm:gap-y-3 max-sm:[&>div]:col-start-1 max-sm:[&>div]:row-start-2"
				title="Counter"
			/>
			{canSeeDayClose ? (
				<Tabs
					className="grid gap-6"
					onValueChange={(value: CounterTab) => onTabChange(value)}
					value={activeTab}
				>
					<CounterTabs
						actions={
							isSummary ? (
								<DayRow
									date={day}
									onDateChange={onDateChange}
									storeId={selectedStoreId}
									today={today}
								/>
							) : null
						}
					/>
					<TabsContent value={activeTab}>{panel}</TabsContent>
				</Tabs>
			) : (
				<div className="grid gap-6">{panel}</div>
			)}
		</>
	);
};
