import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { TextSkeleton } from "@/components/text-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
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
	{ id: "summary", label: "Payments & Sales" },
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

// Wraps on a 390px iPhone, where the day doesn't fit beside the tabs.
const CounterTabs = ({ actions }: CounterTabsProps) => (
	<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
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

// A Store's Status as it usually opens: two workshop Categories, nothing
// pending, then the top of the pickup shelf.
const CounterBodySkeleton = () => (
	<div aria-hidden className="@container grid gap-6 text-body">
		<Section title="Ready Estimate">
			<ul className="overflow-hidden rounded-lg border bg-card">
				{Array.from({ length: 2 }, (_, index) => (
					<li
						className="grid gap-y-0.5 border-border border-t px-3 py-2.5 first:border-t-0"
						key={index}
					>
						<TextSkeleton className="w-28" />
						<TextSkeleton className="w-36 text-footnote" />
					</li>
				))}
			</ul>
		</Section>
		<div className="grid items-start gap-6 @3xl:grid-cols-2">
			{["Pending Complaints", "Pending QC Rejects"].map((title) => (
				<Section key={title} title={title}>
					<TextSkeleton className="w-44" />
				</Section>
			))}
		</div>
		<Section title="Pickup Shelf">
			<ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
				{Array.from({ length: 6 }, (_, index) => (
					<li className="grid gap-0.5 px-3 py-3" key={index}>
						<Skeleton className="my-0.5 h-4 w-40" />
						<Skeleton className="my-0.5 h-3 w-28" />
					</li>
				))}
			</ul>
		</Section>
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

	const { data: shelf, isPending: isShelfPending } = useInfiniteQuery(
		counterQueries.pickupShelf(storeId),
	);
	const sheetOrders = useMemo(
		() =>
			shelf?.pages.flatMap((page) =>
				page.items.map((order) => ({ id: order.order_id })),
			) ?? [],
		[shelf],
	);
	useOrderSheet({
		isReady: !isShelfPending,
		onClose: handleCloseOrder,
		onSelect: handleOpenOrder,
		openId: isWide ? open : undefined,
		orders: sheetOrders,
	});

	if (isPending) {
		return <CounterBodySkeleton />;
	}
	if (isError) {
		return (
			<p className="text-destructive text-body">Could not load the Counter.</p>
		);
	}

	return (
		<div className="@container grid gap-6 text-body">
			<WorkshopSection categories={data.categories} workshop={data.workshop} />
			{/* Side by side only when a Complaint's reason fits uncut; a tablet with the sidebar open stays stacked. */}
			<div className="grid items-start gap-6 @3xl:grid-cols-2">
				<PendingComplaintsSection complaints={data.complaints} />
				<PendingQcRejectsSection rejects={data.qc_rejects} />
			</div>
			<PickupShelfSection
				isWide={isWide}
				openOrderId={isWide ? open : undefined}
				shelf={data.pickup_shelf}
				storeId={storeId}
			/>
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
	const storesQuery = useQuery(storesQueries.list());
	const stores = storesQuery.data ?? [];

	const isAdmin = me?.role === "admin";
	const ownStoreIds = me?.userStores.map((item) => item.store_id) ?? [];
	const firstStoreId = isAdmin ? stores[0]?.id : ownStoreIds[0];
	// A link shared from another Store falls back to the worker's own Store.
	const selectedStoreId =
		storeId && (isAdmin || ownStoreIds.includes(storeId))
			? storeId
			: firstStoreId;
	const hasPicker = isAdmin || ownStoreIds.length > 1;
	const today = useJakartaToday();
	// A date after today, from a hand-edited link, falls back to today.
	const day = date && date < today ? date : today;
	const isSummary = tab === "summary" && selectedStoreId !== undefined;

	let panel = storesQuery.isPending ? (
		<CounterBodySkeleton />
	) : (
		<p className="text-muted-foreground">No Store.</p>
	);
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
			<Tabs
				className="grid gap-6"
				onValueChange={(value: CounterTab) => onTabChange(value)}
				value={tab}
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
				<TabsContent value={tab}>{panel}</TabsContent>
			</Tabs>
		</>
	);
};
