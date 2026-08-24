import { PICKUP_OVERDUE_HOURS } from "@fresclean/api/schema";
import {
	CaretRightIcon,
	FunnelIcon,
	MagnifyingGlassIcon,
	ScanIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { QueueStatusTabs } from "@/features/orders/components/queue-status-tabs";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { useBarcodeScanner } from "@/features/orders/hooks/useBarcodeScanner";
import {
	type FetchOrderServiceQueueQuery,
	fetchOrderDetail,
	fetchOrderServiceQueuePage,
	lookupOrderServiceById,
	lookupOrderServiceByItemCode,
	type QueueOrderServiceItem,
	queryKeys,
} from "@/lib/api";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	meQueryOptions,
	orderServiceQueueCountsQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import { readServerErrorMessage } from "@/lib/server-error";
import {
	ACTIVE_ORDER_SERVICE_STATUSES,
	formatOrderServiceStatus,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";

const QUEUE_PAGE_SIZE = 20;

const TERMINAL_QUEUE_STATUSES = new Set<QueueOrderServiceItem["status"]>([
	"picked_up",
	"refunded",
	"cancelled",
]);

const HOUR_MS = 3_600_000;

// One threshold, not a four-step ramp: an amber-at-24h/red-at-72h scale paints a
// whole backlog the same colour, and a list where every row is red says nothing.
const TURNAROUND_MS = PICKUP_OVERDUE_HOURS * HOUR_MS;

// One timer for the whole list, not one per row: the queue scrolls to hundreds
// of rows and each row used to own its own interval, so the clock cost grew
// with the backlog and every row ticked on its own drifting phase.
function useMinuteClock(): number {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(interval);
	}, []);

	return now;
}

function formatElapsedDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60_000);
	if (totalMinutes < 60) {
		return `${Math.max(totalMinutes, 0)}m`;
	}
	const totalHours = Math.floor(totalMinutes / 60);
	if (totalHours < 48) {
		return `${totalHours}h`;
	}
	return `${Math.floor(totalHours / 24)}d`;
}

const queueSearchSchema = z.object({
	storeId: z.coerce.number().int().positive().optional(),
	status: z.enum(ACTIVE_ORDER_SERVICE_STATUSES).optional(),
	dateFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	dateTo: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

const numericLookupRegex = /^\d+$/;

export const Route = createFileRoute("/_admin/queue/")({
	validateSearch: (search) => queueSearchSchema.parse(search),
	loader: async ({ context }) => {
		const currentUser = getCurrentUser();

		await Promise.all([
			context.queryClient.ensureQueryData(storesQueryOptions()),
			currentUser
				? context.queryClient.ensureQueryData(meQueryOptions())
				: undefined,
		]);
	},
	component: QueuePage,
});

function QueuePage() {
	const currentUser = getCurrentUser();
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const loadMoreRef = useRef<HTMLDivElement | null>(null);

	const [itemCode, setItemCode] = useState("");
	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const now = useMinuteClock();

	const meQuery = useQuery({
		...meQueryOptions(),
		enabled: !!currentUser,
	});

	const userStoreIds = useMemo(
		() => meQuery.data?.userStores.map((item) => item.store_id) ?? [],
		[meQuery.data],
	);
	// DB-fresh role — JWT claim goes stale on mid-session role changes.
	const role = meQuery.data?.role;

	useEffect(() => {
		if (!currentUser || search.storeId !== undefined) {
			return;
		}

		if (role === "admin") {
			return;
		}

		if (userStoreIds.length > 0) {
			void navigate({
				search: (prev) => ({ ...prev, storeId: userStoreIds[0] }),
				replace: true,
			});
		}
	}, [currentUser, navigate, search.storeId, userStoreIds, role]);

	const parsedStoreId = useMemo(() => {
		if (search.storeId !== undefined) {
			return search.storeId;
		}

		if (role === "admin") {
			return undefined;
		}

		return userStoreIds[0];
	}, [role, search.storeId, userStoreIds]);
	const selectedStatus = search.status;
	const selectedDateFrom = search.dateFrom;
	const selectedDateTo = search.dateTo;
	const queueQueryInput: FetchOrderServiceQueueQuery | undefined =
		parsedStoreId !== undefined
			? {
					limit: QUEUE_PAGE_SIZE,
					store_id: parsedStoreId,
					...(selectedStatus !== undefined ? { status: selectedStatus } : {}),
					...(selectedDateFrom !== undefined
						? { date_from: selectedDateFrom }
						: {}),
					...(selectedDateTo !== undefined ? { date_to: selectedDateTo } : {}),
				}
			: undefined;

	const queueQuery = useInfiniteQuery({
		queryKey: [
			...queryKeys.orderServiceQueue({
				store_id: parsedStoreId,
				status: selectedStatus,
				date_from: selectedDateFrom,
				date_to: selectedDateTo,
			}),
			"infinite",
		],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			fetchOrderServiceQueuePage({
				...queueQueryInput,
				offset: pageParam,
			}),
		getNextPageParam: (lastPage) => {
			const nextOffset = lastPage.meta.offset + lastPage.meta.limit;
			return nextOffset < lastPage.meta.total ? nextOffset : undefined;
		},
		enabled: parsedStoreId !== undefined,
	});

	const countsQuery = useQuery({
		...orderServiceQueueCountsQueryOptions(parsedStoreId),
		enabled: parsedStoreId !== undefined,
	});

	const queueQueryRef = useRef(queueQuery);
	useEffect(() => {
		queueQueryRef.current = queueQuery;
	});

	useEffect(() => {
		const node = loadMoreRef.current;
		if (!node) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const [entry] = entries;
				if (!entry?.isIntersecting) {
					return;
				}
				const current = queueQueryRef.current;
				if (current.hasNextPage && !current.isFetchingNextPage) {
					void current.fetchNextPage();
				}
			},
			{ rootMargin: "240px 0px" },
		);

		observer.observe(node);

		return () => observer.disconnect();
	}, []);

	const lookupMutation = useMutation({
		mutationFn: async ({
			mode,
			value,
		}: {
			mode: "manual" | "scan";
			value: string;
		}) => {
			const query = value.trim();
			if (!query) {
				throw new Error("Enter an item code, order ID, or line ID");
			}

			if (mode === "manual" && numericLookupRegex.test(query)) {
				const numericId = Number(query);

				try {
					const order = await fetchOrderDetail(numericId);
					return {
						orderId: order.id,
						storeId: order.store_id,
					};
				} catch {
					// Fall through to line-id lookup.
				}

				try {
					const orderService = await lookupOrderServiceById(numericId);
					if (orderService.order) {
						return {
							orderId: orderService.order.id,
							storeId: orderService.order.store_id,
							queueServiceId: orderService.id,
						};
					}
				} catch {
					// Fall through to item-code lookup.
				}
			}

			const orderService = await lookupOrderServiceByItemCode(query);
			if (!orderService.order) {
				throw new Error(
					mode === "scan"
						? "Shoe item not found"
						: "No item, order, or line matched",
				);
			}

			return {
				orderId: orderService.order.id,
				storeId: orderService.order.store_id,
				queueServiceId: orderService.id,
			};
		},
		onSuccess: (result) => {
			if (result.queueServiceId !== undefined) {
				void navigate({
					to: "/queue/$orderId/$serviceId",
					params: {
						orderId: String(result.orderId),
						serviceId: String(result.queueServiceId),
					},
				});
				return;
			}

			void navigate({
				to: "/orders/$orderId",
				params: {
					orderId: String(result.orderId),
				},
			});
		},
		onError: (error: Error) => {
			toast.error(
				readServerErrorMessage(error, "Failed to find item, order, or line"),
			);
		},
	});

	const scanner = useBarcodeScanner((rawValue) => {
		setItemCode(rawValue);
		lookupMutation.mutate({ mode: "scan", value: rawValue });
	});

	const queueItems =
		queueQuery.data?.pages.flatMap((page) => page.items) ??
		([] as QueueOrderServiceItem[]);
	const totalItems = queueQuery.data?.pages[0]?.meta.total ?? 0;

	const navigateToQueueDetail = useCallback(
		(item: QueueOrderServiceItem) => {
			void navigate({
				to: "/queue/$orderId/$serviceId",
				params: {
					orderId: String(item.order_id),
					serviceId: String(item.id),
				},
			});
		},
		[navigate],
	);

	const updateStoreFilter = (value: string) => {
		void navigate({
			search: (prev) => ({
				...prev,
				storeId: value ? Number(value) : undefined,
			}),
		});
	};

	const updateStatusFilter = (value: string) => {
		void navigate({
			search: (prev) => ({
				...prev,
				status:
					value && value !== "all"
						? (value as (typeof ACTIVE_ORDER_SERVICE_STATUSES)[number])
						: undefined,
			}),
		});
	};

	const updateDateRangeFilter = (next: { from?: string; to?: string } = {}) => {
		void navigate({
			search: (prev) => ({
				...prev,
				dateFrom: next.from,
				dateTo: next.to,
			}),
		});
	};

	const activeFilterCount =
		(selectedDateFrom || selectedDateTo ? 1 : 0) +
		(role === "admin" && parsedStoreId !== undefined ? 1 : 0);

	return (
		<>
			<PageHeader
				actions={
					<div className="flex items-center gap-2">
						<Badge variant={queueQuery.isLoading ? "secondary" : "outline"}>
							{`${totalItems} items`}
						</Badge>
						<Dialog onOpenChange={setIsFilterOpen} open={isFilterOpen}>
							<DialogTrigger
								render={
									<Button
										aria-label="Filters"
										icon={<FunnelIcon className="size-4" />}
										type="button"
										variant="outline"
									/>
								}
							>
								{activeFilterCount > 0 ? String(activeFilterCount) : null}
							</DialogTrigger>
							<DialogContent className="max-w-[calc(100%-1.5rem)] gap-5 p-4 sm:max-w-md">
								<DialogHeader>
									<DialogTitle>Filters</DialogTitle>
								</DialogHeader>
								<div className="grid gap-4">
									<StoreAutocomplete
										allowedStoreIds={
											role === "admin" ? undefined : userStoreIds
										}
										id="queue-store"
										onValueChange={updateStoreFilter}
										placeholder="Select store"
										value={parsedStoreId?.toString() ?? ""}
									/>
									<DateRangePicker
										commitOnComplete
										from={selectedDateFrom}
										onChange={updateDateRangeFilter}
										onClear={() => updateDateRangeFilter()}
										to={selectedDateTo}
									/>
									<Button
										className="h-10 pointer-coarse:h-11"
										onClick={() => setIsFilterOpen(false)}
										type="button"
									>
										Done
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>
				}
				title="Queue"
			/>

			<div className="grid gap-3">
				<div className="flex items-center gap-2">
					<Input
						aria-label="Find by item code, order ID, or line ID"
						autoCapitalize="none"
						autoCorrect="off"
						className="min-w-0 flex-1"
						spellCheck={false}
						onChange={(event) => setItemCode(event.target.value)}
						// Same guard the Find button carries: without it a held Enter
						// fires a second lookup over the first and navigates twice.
						onKeyDown={(event) => {
							if (
								event.key === "Enter" &&
								itemCode.trim() &&
								!lookupMutation.isPending
							) {
								lookupMutation.mutate({
									mode: "manual",
									value: itemCode.trim(),
								});
							}
						}}
						placeholder="Item code / order ID…"
						value={itemCode}
					/>
					<Button
						aria-label="Find"
						disabled={!itemCode.trim() || lookupMutation.isPending}
						icon={<MagnifyingGlassIcon className="size-4" />}
						onClick={() => {
							lookupMutation.mutate({ mode: "manual", value: itemCode.trim() });
						}}
						size="icon-lg"
						type="button"
						variant="outline"
					/>
					<Button
						aria-label={scanner.isScanning ? "Stop scan" : "Scan tag"}
						icon={<ScanIcon className="size-4" />}
						onClick={() => {
							if (scanner.isScanning) {
								scanner.stop();
								return;
							}

							void scanner.start();
						}}
						size="icon-lg"
						type="button"
						variant={scanner.isScanning ? "default" : "outline"}
					/>
				</div>

				{scanner.error ? (
					<div className="flex items-center gap-2 text-destructive text-sm">
						<WarningCircleIcon className="size-4" weight="fill" />
						<span>{scanner.error}</span>
					</div>
				) : null}

				{scanner.isScanning ? (
					<video
						autoPlay
						className="aspect-video w-full border border-border object-cover"
						muted
						playsInline
						ref={scanner.videoRef}
					/>
				) : null}

				<QueueStatusTabs
					counts={countsQuery.data}
					onValueChange={updateStatusFilter}
					value={selectedStatus ?? "all"}
				/>

				<section className="grid min-w-0 gap-2">
					{role === "admin" && parsedStoreId === undefined ? (
						<div className="border border-dashed border-border px-4 py-8 text-center text-muted-foreground text-sm">
							Select a store.
						</div>
					) : null}

					{queueItems.map((item) => (
						<QueueRow
							currentUserId={currentUser?.id}
							item={item}
							key={item.id}
							now={now}
							onOpen={navigateToQueueDetail}
						/>
					))}

					{/* isLoading, never isPending: with no store picked this query is
					    disabled, and a disabled query stays pending forever. */}
					{queueQuery.isLoading ? (
						<div className="grid gap-2">
							{Array.from({ length: 6 }, (_, index) => (
								<div
									className="h-20 animate-pulse border border-border bg-muted/40"
									key={index}
								/>
							))}
						</div>
					) : null}

					{queueQuery.isError ? (
						<div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">
							{queueQuery.error instanceof Error
								? queueQuery.error.message
								: "Failed to load the queue."}
						</div>
					) : null}

					{!queueQuery.isLoading &&
					!queueQuery.isError &&
					queueItems.length === 0 &&
					parsedStoreId !== undefined ? (
						<div className="border border-dashed border-border px-4 py-8 text-center text-muted-foreground text-sm">
							No items.
						</div>
					) : null}

					<div className="h-6" ref={loadMoreRef} />

					{queueQuery.isFetchingNextPage ? (
						<p className="text-center text-muted-foreground text-sm">
							Loading…
						</p>
					) : null}
				</section>
			</div>
		</>
	);
}

interface QueueRowProps {
	item: QueueOrderServiceItem;
	currentUserId?: number;
	now: number;
	onOpen: (item: QueueOrderServiceItem) => void;
}

const QueueRow = memo(({ item, currentUserId, now, onOpen }: QueueRowProps) => {
	const isTerminal = TERMINAL_QUEUE_STATUSES.has(item.status);
	const elapsedMs = Math.max(
		0,
		now - new Date(item.order_created_at).getTime(),
	);
	const isBreached = !isTerminal && elapsedMs >= TURNAROUND_MS;

	const isHandledByCurrentUser =
		currentUserId !== undefined && item.handler_id === currentUserId;
	const handler = isHandledByCurrentUser
		? "Me"
		: (item.handler_name ?? (item.handler_id === null ? null : "Worker"));

	// Lead with whatever actually identifies the Item. Descriptors are optional at
	// intake, so a fixed "descriptors on top" row shouts "No item details" at full
	// weight and demotes the service — the only thing left that says anything.
	const descriptors = getOrderServiceItemDetails(item);
	const secondary = [descriptors ? item.service_name : null, handler]
		.filter(Boolean)
		.join(" · ");

	return (
		// min-w-0 at every level down to the truncating text: without it the row's
		// min-content sizes the auto grid column, and the search field and status
		// chips above — siblings in that same column — get pushed off screen.
		<button
			className="group flex min-w-0 items-stretch gap-0 border border-border bg-background text-left transition-colors hover:bg-muted/40"
			onClick={() => onOpen(item)}
			type="button"
		>
			<span className="grid min-w-0 flex-1 gap-0.5 px-3 py-2.5">
				<span className="flex min-w-0 items-baseline gap-2">
					<span className="min-w-0 flex-1 truncate font-medium text-sm">
						{descriptors ?? item.service_name}
					</span>
					<span
						className={cn(
							"shrink-0 font-mono font-semibold text-sm tabular-nums",
							isBreached ? "text-destructive" : "text-muted-foreground",
						)}
					>
						{isTerminal ? "—" : formatElapsedDuration(elapsedMs)}
					</span>
					<CaretRightIcon
						className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
						weight="bold"
					/>
				</span>
				<span className="flex min-w-0 items-baseline gap-2 text-muted-foreground text-xs">
					{/* On the All chip a queued Item and one back from a failed quality
					    check are otherwise the same row, and triaging the rack means
					    opening each one. Kept on the filtered chips too: a barcode scan
					    and a search both land here spanning statuses. */}
					{item.is_priority ? (
						<Badge
							className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide"
							variant="warning"
						>
							Priority
						</Badge>
					) : null}
					<Badge
						className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide"
						variant="outline"
					>
						{formatOrderServiceStatus(item.status)}
					</Badge>
					<span className="min-w-0 flex-1 truncate">{secondary}</span>
					<span className="shrink-0 font-mono text-[10px]">
						{item.item_code ?? `#${item.id}`}
					</span>
				</span>
			</span>
		</button>
	);
});
QueueRow.displayName = "QueueRow";
