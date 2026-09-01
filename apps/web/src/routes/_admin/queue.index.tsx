import { TURNAROUND_PROMISE_HOURS } from "@fresclean/api/schema";
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
	lookupItemByItemCode,
	lookupOrderServiceById,
	type QueueItem,
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

const HOUR_MS = 3_600_000;

// One threshold, not a four-step ramp: an amber-at-24h/red-at-72h scale paints a
// whole backlog the same colour, and a list where every row is red says nothing.
// The workshop clock (from drop-off) — not PICKUP_OVERDUE_HOURS, which times
// the customer's collection from ready_at on a different screen.
const TURNAROUND_MS = TURNAROUND_PROMISE_HOURS * HOUR_MS;

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
	// Set when a scanned tag turns out to have several treatments open on it:
	// the rack narrows to that one object so the worker can say which job they
	// are starting (ADR-0017).
	search: z.string().min(1).optional(),
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
	const selectedSearch = search.search;
	const queueQueryInput: FetchOrderServiceQueueQuery | undefined =
		parsedStoreId !== undefined
			? {
					limit: QUEUE_PAGE_SIZE,
					store_id: parsedStoreId,
					...(selectedStatus !== undefined ? { status: selectedStatus } : {}),
					...(selectedSearch !== undefined ? { search: selectedSearch } : {}),
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
				search: selectedSearch,
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

			// A tag names an object, and an object can have several treatments open
			// on it (ADR-0017). Go straight to the work screen when there is only
			// one thing to do; otherwise land on the queue filtered to that tag and
			// let the worker pick off the card.
			const item = await lookupItemByItemCode(query);
			if (!item.order) {
				throw new Error(
					mode === "scan"
						? "Item not found"
						: "No item, order, or line matched",
				);
			}

			return {
				orderId: item.order.id,
				storeId: item.order.store_id,
				queueServiceId:
					item.services.length === 1 ? item.services[0].id : undefined,
				itemCode: item.services.length > 1 ? item.item_code : undefined,
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

			// Several jobs open on the one object: show its card and let the worker
			// say which one they are starting.
			if (result.itemCode !== undefined) {
				void navigate({
					search: (prev) => ({
						...prev,
						search: result.itemCode,
						status: undefined,
					}),
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
		queueQuery.data?.pages.flatMap((page) => page.items) ?? ([] as QueueItem[]);
	const totalItems = queueQuery.data?.pages[0]?.meta.total ?? 0;

	const navigateToQueueDetail = useCallback(
		(item: QueueItem, serviceId: number) => {
			void navigate({
				to: "/queue/$orderId/$serviceId",
				params: {
					orderId: String(item.order_id),
					serviceId: String(serviceId),
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

	// Set by a scan that landed on a multi-treatment tag. Nothing else writes it,
	// and without a way back the worker stays on a one-card rack — the chips above
	// keep counting the whole branch, so the counts stop matching the list.
	const clearSearchFilter = () => {
		void navigate({
			search: (prev) => ({ ...prev, search: undefined }),
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
							{`${totalItems} ${totalItems === 1 ? "item" : "items"}`}
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

				{selectedSearch ? (
					<div className="flex min-w-0 items-center gap-2 border border-dashed border-border px-3 py-2 text-sm">
						<span className="min-w-0 flex-1 truncate text-muted-foreground">
							Showing <span className="font-mono">{selectedSearch}</span> only
						</span>
						<Button
							onClick={clearSearchFilter}
							size="sm"
							type="button"
							variant="outline"
						>
							Clear
						</Button>
					</div>
				) : null}

				{/* Hidden while a scanned tag pins the list to one object: the counts
				    describe the whole branch, and chips saying "47" over a one-card
				    list are lying. They come back with Clear. */}
				{!selectedSearch && (
					<QueueStatusTabs
						counts={countsQuery.data}
						onValueChange={updateStatusFilter}
						value={selectedStatus ?? "all"}
					/>
				)}

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
	item: QueueItem;
	currentUserId?: number;
	now: number;
	onOpen: (item: QueueItem, serviceId: number) => void;
}

// One card per physical object, with every treatment still live on it listed
// inside (ADR-0017). A pair in for a deep clean, a repaint and leather care
// used to be three separate rows on the rack with nothing saying they were the
// same shoe — and physics already stops two workers holding it at once.
const QueueRow = memo(({ item, currentUserId, now, onOpen }: QueueRowProps) => {
	const elapsedMs = Math.max(
		0,
		now - new Date(item.order_created_at).getTime(),
	);
	const isBreached = elapsedMs >= TURNAROUND_MS;

	// Descriptors are optional at intake, so falling back to the tag keeps the
	// heading from reading "No item details" at full weight.
	const descriptors = getOrderServiceItemDetails(item);

	return (
		// min-w-0 at every level down to the truncating text: without it the card's
		// min-content sizes the auto grid column, and the search field and status
		// chips above — siblings in that same column — get pushed off screen.
		<article className="min-w-0 border border-border bg-background">
			<header className="flex min-w-0 items-baseline gap-2 px-3 pt-2.5 pb-1.5">
				<h3 className="min-w-0 flex-1 truncate font-medium text-sm">
					{descriptors ?? item.item_code}
				</h3>
				{item.is_priority ? (
					<Badge
						className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide"
						variant="warning"
					>
						Priority
					</Badge>
				) : null}
				<span
					className={cn(
						"shrink-0 font-mono font-semibold text-sm tabular-nums",
						isBreached ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{formatElapsedDuration(elapsedMs)}
				</span>
			</header>

			<p className="flex min-w-0 items-baseline gap-2 px-3 pb-1.5 text-muted-foreground text-xs">
				<span className="min-w-0 flex-1 truncate">{item.order_code}</span>
				<span className="shrink-0 font-mono text-[10px]">{item.item_code}</span>
			</p>

			{/* Each treatment is its own target: the worker taps the job they are
			    about to do, not the object. */}
			<ul className="grid">
				{item.services.map((service) => {
					const handler =
						service.handler_id === currentUserId
							? "Me"
							: (service.handler_name ??
								(service.handler_id === null ? null : "Worker"));

					return (
						<li className="min-w-0" key={service.id}>
							<button
								className="group flex w-full min-w-0 items-baseline gap-2 border-border/70 border-t px-3 py-2 text-left transition-colors hover:bg-muted/40"
								onClick={() => onOpen(item, service.id)}
								type="button"
							>
								<Badge
									className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide"
									variant="outline"
								>
									{formatOrderServiceStatus(service.status)}
								</Badge>
								<span className="min-w-0 flex-1 truncate text-sm">
									{service.service_name}
								</span>
								{handler ? (
									<span className="shrink-0 text-muted-foreground text-xs">
										{handler}
									</span>
								) : null}
								{/* self-center: an svg has no text baseline, so in this
								    baseline-aligned row it would ride 3px high. */}
								<CaretRightIcon
									className="size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5"
									weight="bold"
								/>
							</button>
						</li>
					);
				})}
			</ul>
		</article>
	);
});
QueueRow.displayName = "QueueRow";
