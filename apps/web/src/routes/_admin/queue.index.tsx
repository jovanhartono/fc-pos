import {
	QUEUE_CATEGORY_MODES,
	TURNAROUND_PROMISE_HOURS,
	WORKSHOP_SERVICE_STATUSES,
} from "@fresclean/api/schema";
import {
	CaretRightIcon,
	FunnelIcon,
	ScanIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import {
	keepPreviousData,
	useInfiniteQuery,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import {
	lazy,
	memo,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { z } from "zod";
import { APP_CONTENT_SCROLL_ID } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { FilterCountBadge } from "@/components/filter-count-badge";
import { PageHeader } from "@/components/page-header";
import { StickyControls } from "@/components/sticky-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type FetchOrderServiceQueueQuery,
	lookupQueueTarget,
	ordersQueries,
	type QueueCategoryMode,
	type QueueItem,
	type QueueItemService,
} from "@/features/orders/api";
import { QueueCategoryFilter } from "@/features/orders/components/queue-category-filter";
import { QueueStatusTabs } from "@/features/orders/components/queue-status-tabs";
import { ReworkRoundLabel } from "@/features/orders/components/rework-round-label";
import { StoreSelect } from "@/features/orders/components/store-select";
import { useBarcodeScanner } from "@/features/orders/hooks/useBarcodeScanner";
import { getQueueAgeTone } from "@/features/orders/lib/queue-age-tone";
import { groupReworksUnderOriginals } from "@/features/orders/lib/rework-nesting";
import { storesQueries } from "@/features/stores/api";
import { usersQueries } from "@/features/users/api";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { CONTENT_FADE, staleFade } from "@/lib/content-fade";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { isNotFoundError, readServerErrorMessage } from "@/lib/server-error";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";
import { useQueuePreferencesStore } from "@/stores/queue-preferences-store";

// The filter dialog is the only place on this page that needs the range
// calendar, so it ships in its own chunk instead of the queue's initial load.
const DateRangePicker = lazy(() =>
	import("@/components/ui/date-picker").then((module) => ({
		default: module.DateRangePicker,
	})),
);

const QUEUE_PAGE_SIZE = 20;

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
	status: z.enum(WORKSHOP_SERVICE_STATUSES).optional(),
	// Set when a scanned tag turns out to have several treatments open on it:
	// the rack narrows to that one object so the worker can say which job they
	// are starting (ADR-0017). A typed customer name or phone sets it too.
	search: z.string().min(1).optional(),
	dateFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	dateTo: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	categoryId: z.coerce.number().int().positive().optional(),
	categoryMode: z.enum(QUEUE_CATEGORY_MODES).optional(),
});

export const Route = createFileRoute("/_admin/queue/")({
	validateSearch: (search) => queueSearchSchema.parse(search),
	// The worker's rack is picked before the page draws, so the chips and the
	// Filters badge don't redraw a beat after arriving. The remembered branch is
	// restored only on arrival, so an explicit clear stays cleared.
	beforeLoad: ({ context, search, cause }) => {
		if (search.storeId !== undefined || cause === "preload") {
			return;
		}
		const { me } = context;
		const userStoreIds = me.userStores.map((item) => item.store_id);
		const currentUser = getCurrentUser();
		const persistedStoreId = currentUser
			? useQueuePreferencesStore.getState().storeIdByUser[
					String(currentUser.id)
				]
			: undefined;
		// Only a branch this worker may still see — one moved between branches
		// since must not land on the old rack.
		const restoredStoreId =
			cause === "enter" &&
			persistedStoreId !== undefined &&
			(me.role === "admin" || userStoreIds.includes(persistedStoreId))
				? persistedStoreId
				: undefined;
		// A worker always has a rack; only an admin may look at none.
		const storeId =
			restoredStoreId ?? (me.role === "admin" ? undefined : userStoreIds[0]);
		if (storeId !== undefined) {
			throw redirect({
				to: "/queue",
				search: { ...search, storeId },
				replace: true,
			});
		}
	},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(storesQueries.list()),
	component: QueuePage,
	// Past a second, the page itself draws with skeleton cards.
	pendingComponent: QueuePage,
	codeSplitGroupings: [["component", "pendingComponent"]],
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
		...usersQueries.me(),
		enabled: !!currentUser,
	});
	const currentUserKey = currentUser ? String(currentUser.id) : "";
	const persistedStoreId = useQueuePreferencesStore(
		(state) => state.storeIdByUser[currentUserKey],
	);
	const setPersistedStoreId = useQueuePreferencesStore(
		(state) => state.setStoreId,
	);

	const userStoreIds = useMemo(
		() => meQuery.data?.userStores.map((item) => item.store_id) ?? [],
		[meQuery.data],
	);
	// DB-fresh role — JWT claim goes stale on mid-session role changes.
	const role = meQuery.data?.role;

	// With a store in the URL, remember it — however it got there: the filter
	// dialog, a scan, or the back link from a job. beforeLoad restores it.
	useEffect(() => {
		if (
			currentUser &&
			search.storeId !== undefined &&
			search.storeId !== persistedStoreId
		) {
			setPersistedStoreId(currentUserKey, search.storeId);
		}
	}, [
		currentUser,
		currentUserKey,
		persistedStoreId,
		search.storeId,
		setPersistedStoreId,
	]);

	const persistedCategory = useQueuePreferencesStore(
		(state) => state.categoryByUser[currentUserKey],
	);
	const setPersistedCategory = useQueuePreferencesStore(
		(state) => state.setCategory,
	);
	// Arriving from the sidebar or a job's back link, the worker lands on their
	// own rack; picking "All categories" forgets it, so All is a rack too.
	const selectedCategoryId = search.categoryId ?? persistedCategory?.categoryId;
	const selectedCategoryMode =
		(search.categoryId !== undefined
			? search.categoryMode
			: persistedCategory?.mode) ?? "only";

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
	const categoryQuery =
		selectedCategoryId !== undefined
			? { category_id: selectedCategoryId, category_mode: selectedCategoryMode }
			: {};
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
					...categoryQuery,
				}
			: undefined;

	// A new status, date or category keeps the last cards and count up, faded,
	// until the new ones land, instead of blinking to skeletons and an empty title.
	// An admin who clears the store gets "Select a store", not the last store's rack.
	const keepLastRack =
		parsedStoreId === undefined ? undefined : keepPreviousData;
	const queueQuery = useInfiniteQuery({
		...ordersQueries.queue(queueQueryInput),
		enabled: parsedStoreId !== undefined,
		placeholderData: keepLastRack,
	});

	// The cards on screen belong to this filter. A new filter's cards replace
	// them as a fresh list with a fade, rather than the same cards sliding to
	// new places.
	const queueKey = JSON.stringify(queueQueryInput ?? null);
	const [shownQueueKey, setShownQueueKey] = useState(queueKey);
	if (!queueQuery.isPlaceholderData && shownQueueKey !== queueKey) {
		setShownQueueKey(queueKey);
	}

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
			{
				// The scroll lives in the shell's content pane now, and a margin only
				// counts against the observer's own root — left on the viewport the
				// worker reaches the end of the queue before the next page loads.
				root: document.querySelector(
					`[data-scroll-restoration-id="${APP_CONTENT_SCROLL_ID}"]`,
				),
				rootMargin: "240px 0px",
			},
		);

		observer.observe(node);

		return () => observer.disconnect();
	}, []);

	const lookupMutation = useMutation({
		mutationFn: async ({ value }: { mode: "manual" | "scan"; value: string }) =>
			lookupQueueTarget(value.trim()),
		onSuccess: (result) => {
			if (result.service_id !== null) {
				void navigate({
					to: "/queue/$orderId/$serviceId",
					params: {
						orderId: result.order_id,
						serviceId: result.service_id,
					},
				});
				return;
			}

			// Several lines open on the one object: show its card and let the
			// worker say which one they are starting.
			const itemCode = result.item_code;
			if (itemCode !== null) {
				void navigate({
					search: (prev) => ({
						...prev,
						storeId: result.store_id,
						search: itemCode,
						status: undefined,
					}),
				});
				return;
			}

			void navigate({
				to: "/orders/$orderId",
				params: {
					orderId: String(result.order_id),
				},
			});
		},
		onError: (error: Error, { mode, value }) => {
			// Not a tag or an ID, so a worker typing a regular's name or phone
			// gets the rack narrowed to that customer's items.
			if (mode === "manual" && isNotFoundError(error)) {
				void navigate({
					search: (prev) => ({ ...prev, search: value, status: undefined }),
				});
				return;
			}

			// A scanned tag that is missing (404) and another Store's Order (403)
			// read the same: nothing here matched.
			const isNotMatched =
				error instanceof DetailedError &&
				(error.statusCode === 404 || error.statusCode === 403);

			toast.error(
				isNotMatched
					? "No item, order, or line matched"
					: readServerErrorMessage(
							error,
							"Failed to find item, order, or line",
						),
			);
		},
	});

	const scanner = useBarcodeScanner((rawValue) => {
		setItemCode(rawValue);
		lookupMutation.mutate({ mode: "scan", value: rawValue });
	});

	const queueItems =
		queueQuery.data?.pages.flatMap((page) => page.items) ?? ([] as QueueItem[]);
	const totalItems = queueQuery.data?.pages[0]?.meta.total;

	const navigateToQueueDetail = useCallback(
		(item: QueueItem, serviceId: number) => {
			void navigate({
				to: "/queue/$orderId/$serviceId",
				params: {
					orderId: item.order_id,
					serviceId,
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
						? (value as (typeof WORKSHOP_SERVICE_STATUSES)[number])
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

	const updateCategoryFilter = (
		categoryId: number | undefined,
		mode: QueueCategoryMode,
	) => {
		setPersistedCategory(
			currentUserKey,
			categoryId === undefined ? undefined : { categoryId, mode },
		);
		void navigate({
			search: (prev) => ({
				...prev,
				categoryId,
				categoryMode: categoryId === undefined ? undefined : mode,
			}),
		});
	};

	// Set by a scan that landed on a multi-treatment tag, or a customer search.
	// Without a way back the worker stays on a narrowed rack.
	const clearSearchFilter = () => {
		setItemCode("");
		void navigate({
			search: (prev) => ({ ...prev, search: undefined }),
		});
	};

	const activeFilterCount =
		(selectedDateFrom || selectedDateTo ? 1 : 0) +
		(selectedCategoryId !== undefined ? 1 : 0) +
		(role === "admin" && parsedStoreId !== undefined ? 1 : 0);

	return (
		<>
			{/* An admin with no Store picked has no rack, so no count shows. */}
			<PageHeader count={totalItems} countNoun="item" title="Queue" />

			<div className="grid gap-3">
				<StickyControls className="grid gap-3">
					<div className="flex items-center gap-2">
						<Input
							aria-label="Find by item code, order code, order ID, line ID, or customer"
							autoCapitalize="none"
							autoCorrect="off"
							className="min-w-0 flex-1"
							enterKeyHint="search"
							spellCheck={false}
							onChange={(event) => setItemCode(event.target.value)}
							// Without the pending guard a held Enter fires a second lookup
							// over the first and navigates twice.
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
							placeholder="Item code, order code, or customer"
							value={itemCode}
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
							size="icon"
							type="button"
							variant={scanner.isScanning ? "default" : "outline"}
						/>
						<Dialog onOpenChange={setIsFilterOpen} open={isFilterOpen}>
							<DialogTrigger
								render={
									<Button
										aria-label="Filters"
										className="relative"
										icon={<FunnelIcon className="size-4" />}
										size="icon"
										type="button"
										variant="outline"
									/>
								}
							>
								{activeFilterCount > 0 ? (
									<FilterCountBadge count={activeFilterCount} />
								) : null}
							</DialogTrigger>
							<DialogContent className="max-w-[calc(100%-1.5rem)] gap-5 p-4 sm:max-w-md">
								<DialogHeader>
									<DialogTitle>Filters</DialogTitle>
								</DialogHeader>
								<div className="grid gap-4">
									<StoreSelect
										allowedStoreIds={
											role === "admin" ? undefined : userStoreIds
										}
										id="queue-store"
										onValueChange={updateStoreFilter}
										placeholder="Select store"
										value={parsedStoreId?.toString() ?? ""}
									/>
									<QueueCategoryFilter
										categoryId={selectedCategoryId}
										mode={selectedCategoryMode}
										onChange={updateCategoryFilter}
									/>
									<Field>
										<FieldLabel htmlFor="queue-date">Date</FieldLabel>
										<Suspense fallback={<Skeleton className="h-9 w-full" />}>
											<DateRangePicker
												commitOnComplete
												from={selectedDateFrom}
												fullWidth
												id="queue-date"
												onChange={updateDateRangeFilter}
												onClear={() => updateDateRangeFilter()}
												to={selectedDateTo}
											/>
										</Suspense>
									</Field>
									<Button
										onClick={() => setIsFilterOpen(false)}
										size="lg"
										type="button"
									>
										Done
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>

					{scanner.error ? (
						<div className="flex items-center gap-2 text-destructive text-body">
							<WarningCircleIcon className="size-4" weight="fill" />
							<span>{scanner.error}</span>
						</div>
					) : null}

					{scanner.isScanning ? (
						<video
							autoPlay
							className="aspect-video w-full rounded-lg object-cover"
							muted
							playsInline
							ref={scanner.videoRef}
						/>
					) : null}

					{selectedSearch ? (
						<div className="flex min-w-0 items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-body">
							<span className="min-w-0 flex-1 truncate text-muted-foreground">
								Showing <span className="tabular-nums">{selectedSearch}</span>{" "}
								only
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

					{/* Hidden while a scan or customer search narrows the list; they
					    come back with Clear. */}
					{!selectedSearch && (
						<QueueStatusTabs
							onValueChange={updateStatusFilter}
							value={selectedStatus ?? "all"}
						/>
					)}
				</StickyControls>

				<section className="grid min-w-0 gap-2">
					{role === "admin" && parsedStoreId === undefined ? (
						<EmptyState>Select a store</EmptyState>
					) : null}

					{queueItems.length > 0 ? (
						<div
							className={cn(
								"grid min-w-0 gap-2",
								CONTENT_FADE,
								staleFade(queueQuery.isPlaceholderData),
							)}
							key={shownQueueKey}
						>
							{queueItems.map((item) => (
								<QueueRow
									currentUserId={currentUser?.id}
									item={item}
									key={item.id}
									now={now}
									onOpen={navigateToQueueDetail}
								/>
							))}
						</div>
					) : null}

					{/* isLoading, never isPending: with no store picked this query is
					    disabled, and a disabled query stays pending forever. */}
					{queueQuery.isLoading ? <QueueSkeleton /> : null}

					{queueQuery.isError ? (
						<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-body">
							{queueQuery.error instanceof Error
								? queueQuery.error.message
								: "Failed to load the queue."}
						</div>
					) : null}

					{!queueQuery.isLoading &&
					!queueQuery.isError &&
					queueItems.length === 0 &&
					parsedStoreId !== undefined ? (
						<EmptyState>No items.</EmptyState>
					) : null}

					<div className="h-6" ref={loadMoreRef} />

					{queueQuery.isFetchingNextPage ? (
						<p className="text-center text-muted-foreground text-body">
							Loading…
						</p>
					) : null}
				</section>
			</div>
		</>
	);
}

// A card's shape: the Item over its Order line, then one job row.
const QueueSkeleton = () => (
	<div aria-hidden className="grid gap-2">
		{Array.from({ length: 6 }, (_, index) => (
			<div className="overflow-hidden rounded-lg border bg-card" key={index}>
				<div className="grid gap-0.5 px-3 pt-2.5 pb-2">
					<Skeleton className="my-0.5 h-4 w-1/2" />
					<Skeleton className="my-0.5 h-3.5 w-2/3" />
				</div>
				<div className="grid gap-1 border-border/70 border-t px-3 py-2.5">
					<Skeleton className="my-0.5 h-4 w-2/5" />
					<Skeleton className="my-0.5 h-3.5 w-1/4" />
				</div>
			</div>
		))}
	</div>
);

interface QueueJobButtonProps {
	service: QueueItemService;
	currentUserId?: number;
	onOpen: () => void;
}

const QueueJobButton = ({
	service,
	currentUserId,
	onOpen,
}: QueueJobButtonProps) => {
	const reworkRound = service.rework_round;
	const handler =
		service.handler_id === currentUserId
			? "Me"
			: (service.handler_name ??
				(service.handler_id === null ? null : "Worker"));

	return (
		<button
			className={cn(
				"group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
				reworkRound !== null && "pt-1 pl-5",
			)}
			onClick={onOpen}
			type="button"
		>
			<span className="min-w-0 break-words text-body">
				{reworkRound === null ? (
					service.service_name
				) : (
					<>
						<span aria-hidden="true" className="text-muted-foreground">
							└{" "}
						</span>
						<ReworkRoundLabel
							round={reworkRound}
							serviceName={service.service_name}
						/>
					</>
				)}
			</span>
			<CaretRightIcon
				aria-hidden="true"
				className="row-span-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
				weight="bold"
			/>
			<span
				className={cn(
					"flex min-w-0 flex-wrap items-center gap-1.5 text-subhead",
					reworkRound !== null && "pl-4",
				)}
			>
				<Badge variant={getOrderServiceStatusBadgeVariant(service.status)}>
					{formatOrderServiceStatus(service.status)}
				</Badge>
				{service.is_priority && reworkRound === null ? (
					<Badge variant="priority">Priority</Badge>
				) : null}
				{handler ? <span>{handler}</span> : null}
			</span>
		</button>
	);
};

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
	const ageTone = getQueueAgeTone(elapsedMs, TURNAROUND_PROMISE_HOURS);

	// Descriptors are optional at intake, so falling back to the tag keeps the
	// heading from reading "No item details" at full weight.
	const descriptors = getOrderServiceItemDetails(item);

	return (
		// min-w-0 at every level down to the truncating text: without it the card's
		// min-content sizes the auto grid column, and the search field and status
		// chips above — siblings in that same column — get pushed off screen.
		<article className="min-w-0 overflow-hidden rounded-lg border bg-card">
			<header className="grid min-w-0 gap-0.5 px-3 pt-2.5 pb-2">
				<h3 className="flex min-w-0 items-baseline gap-2 font-medium text-headline leading-snug">
					{descriptors ? (
						<span className="min-w-0 flex-1 wrap-break-word">
							{descriptors}
						</span>
					) : (
						<span className="min-w-0 flex-1 break-all tabular-nums">
							{item.item_code}
						</span>
					)}
				</h3>
				<p className="flex min-w-0 items-baseline gap-2 text-subhead">
					<span className="min-w-0 flex-1 truncate">
						{item.order_code} · {item.customer_name}
					</span>
					<span
						className={cn(
							"shrink-0 font-semibold tabular-nums",
							ageTone === "amber" && "text-tone-warn-foreground",
							ageTone === "red" && "text-destructive",
						)}
					>
						{formatElapsedDuration(elapsedMs)}
					</span>
				</p>
			</header>

			{/* Each treatment is its own target: the worker taps the job they are
			    about to do, not the object. */}
			<ul className="grid">
				{groupReworksUnderOriginals(
					item.services,
					(service) => service.rework_of_line_id,
				).map(({ original, originalId, reworks }) => (
					<li className="min-w-0 border-border/70 border-t" key={originalId}>
						{original ? (
							<QueueJobButton
								currentUserId={currentUserId}
								onOpen={() => onOpen(item, original.id)}
								service={original}
							/>
						) : (
							// Picked up and brought back: the original is off the rack,
							// but the worker still needs to know what is being redone.
							<p className="min-w-0 wrap-break-word px-3 pt-2.5 text-body">
								{reworks[0]?.rework_of_service_name ?? "Service"}
							</p>
						)}
						{reworks.map((rework) => (
							<QueueJobButton
								currentUserId={currentUserId}
								key={rework.id}
								onOpen={() => onOpen(item, rework.id)}
								service={rework}
							/>
						))}
					</li>
				))}
			</ul>
		</article>
	);
});
QueueRow.displayName = "QueueRow";
