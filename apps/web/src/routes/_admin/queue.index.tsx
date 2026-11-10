import {
	AlertCircleIcon,
	QrCodeScanIcon,
	Store01Icon,
	Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	keepPreviousData,
	useInfiniteQuery,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { APP_CONTENT_SCROLL_ID } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import {
	dateRangeLabel,
	type FilterChip,
	FilterChips,
} from "@/components/filter-chips";
import { FilterPanel } from "@/components/filter-panel";
import { PageHeader } from "@/components/page-header";
import { StickyControls } from "@/components/sticky-controls";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesQueries } from "@/features/categories/api";
import {
	type FetchOrderServiceQueueQuery,
	lookupQueueTarget,
	ordersQueries,
	type QueueCategoryMode,
	type QueueItem,
} from "@/features/orders/api";
import { QueueCategoryFilter } from "@/features/orders/components/queue-category-filter";
import { QueueRow } from "@/features/orders/components/queue-row";
import { QueueStatusTabs } from "@/features/orders/components/queue-status-tabs";
import { StoreSelect } from "@/features/orders/components/store-select";
import { useBarcodeScanner } from "@/features/orders/hooks/useBarcodeScanner";
import {
	QUEUE_CATEGORY_MODES,
	WORKSHOP_SERVICE_STATUSES,
} from "@/features/orders/lib/queue-search-values";
import { storesQueries } from "@/features/stores/api";
import { usersQueries } from "@/features/users/api";
import { useLoadMore } from "@/hooks/useLoadMore";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { CONTENT_FADE, staleFade } from "@/lib/content-fade";
import { isNotFoundError, readServerErrorMessage } from "@/lib/server-error";
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

const queueSearchSchema = z.object({
	storeId: z.coerce.number().int().positive().optional(),
	status: z.enum(WORKSHOP_SERVICE_STATUSES).optional(),
	// Set when a scanned tag has several Services open on it: the rack narrows to
	// that one Item so the worker can say which one they are starting (ADR-0017).
	// A typed customer name or phone sets it too.
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
	// Filters badge don't redraw a beat after arriving. The remembered Store is
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
		// Only a Store this worker may still see — one moved between Stores
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
});

interface QueueFilterValues {
	storeId?: number;
	categoryId?: number;
	categoryMode: QueueCategoryMode;
	dateFrom?: string;
	dateTo?: string;
}

function QueuePage() {
	const currentUser = getCurrentUser();
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();

	const [itemCode, setItemCode] = useState("");
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

	const me = meQuery.data;
	// DB-fresh role — JWT claim goes stale on mid-session role changes.
	const role = me?.role;

	// With a Store in the URL, remember it — however it got there: the filter
	// dialog, a scan, or a line's back link. beforeLoad restores it.
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
	// Arriving from the sidebar or a line's back link, the worker lands on their
	// own rack; picking "All categories" forgets it, so All is a rack too.
	const selectedCategoryId = search.categoryId ?? persistedCategory?.categoryId;
	const selectedCategoryMode =
		(search.categoryId !== undefined
			? search.categoryMode
			: persistedCategory?.mode) ?? "only";

	const parsedStoreId =
		search.storeId ??
		(role === "admin" ? undefined : me?.userStores[0]?.store_id);
	const selectedStatus = search.status;
	const storesQuery = useQuery(storesQueries.list());
	const categoriesQuery = useQuery({
		...categoriesQueries.list(),
		enabled: selectedCategoryId !== undefined,
	});
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

	// A new status, date or Category keeps the last cards and count up, faded,
	// until the new ones land. An admin who clears the Store gets "Select a store".
	const keepLastRack =
		parsedStoreId === undefined ? undefined : keepPreviousData;
	const queueQuery = useInfiniteQuery({
		...ordersQueries.queue(queueQueryInput),
		enabled: parsedStoreId !== undefined,
		placeholderData: keepLastRack,
	});

	// A new filter's cards come in as a fresh list with a fade, rather than the
	// same cards sliding to new places.
	const queueKey = JSON.stringify(queueQueryInput ?? null);
	const [shownQueueKey, setShownQueueKey] = useState(queueKey);
	if (!queueQuery.isPlaceholderData && shownQueueKey !== queueKey) {
		setShownQueueKey(queueKey);
	}

	// The scroll lives in the shell's content pane, not the window.
	const loadMoreRef = useLoadMore(queueQuery, {
		getRoot: () =>
			document.querySelector(
				`[data-scroll-restoration-id="${APP_CONTENT_SCROLL_ID}"]`,
			),
		rootMargin: "240px 0px",
	});

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

			// Several lines open on the one Item: show its card and let the
			// worker say which one they are starting.
			const itemCode = result.item_code;
			if (itemCode !== null) {
				void navigate({
					replace: true,
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
			// gets the rack narrowed to that customer's Items.
			if (mode === "manual" && isNotFoundError(error)) {
				void navigate({
					replace: true,
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
							"Couldn't find that Item, Order or line",
						),
			);
		},
	});

	const {
		error: scanError,
		isScanning,
		start: startScan,
		stop: stopScan,
		videoRef,
	} = useBarcodeScanner((rawValue) => {
		setItemCode(rawValue);
		lookupMutation.mutate({ mode: "scan", value: rawValue });
	});

	const allowedStoreIds =
		role === "admin"
			? undefined
			: (me?.userStores.map((item) => item.store_id) ?? []);
	const queuePages = queueQuery.data?.pages;
	const hasQueueItems = queuePages?.some((page) => page.items.length > 0);
	const totalItems = queuePages?.[0]?.meta.total;

	const navigateToQueueDetail = (item: QueueItem, serviceId: number) => {
		void navigate({
			to: "/queue/$orderId/$serviceId",
			params: {
				orderId: item.order_id,
				serviceId,
			},
		});
	};

	const queueRows = queuePages
		?.flatMap((page) => page.items)
		.map((item) => (
			<QueueRow
				currentUserId={currentUser?.id}
				item={item}
				key={item.id}
				now={now}
				onOpen={navigateToQueueDetail}
			/>
		));

	const updateStatusFilter = (value: string) => {
		void navigate({
			replace: true,
			search: (prev) => ({
				...prev,
				status:
					value && value !== "all"
						? (value as (typeof WORKSHOP_SERVICE_STATUSES)[number])
						: undefined,
			}),
		});
	};

	// Set by a scan of a tag with several Services open, or a customer search.
	// Without a way back the worker stays on a narrowed rack.
	const clearSearchFilter = () => {
		setItemCode("");
		void navigate({
			replace: true,
			search: (prev) => ({ ...prev, search: undefined }),
		});
	};

	const appliedFilters: QueueFilterValues = {
		storeId: parsedStoreId,
		categoryId: selectedCategoryId,
		categoryMode: selectedCategoryMode,
		dateFrom: selectedDateFrom,
		dateTo: selectedDateTo,
	};

	// A worker's own Store gets no chip and stays on Clear All: their rack
	// needs one.
	const filterChipsFor = (f: QueueFilterValues): FilterChip[] => {
		const chips: FilterChip[] = [];
		if (role === "admin" && f.storeId !== undefined) {
			const store = storesQuery.data?.find((s) => s.id === f.storeId);
			chips.push({
				id: "store",
				label: `Store: ${store?.code ?? f.storeId}`,
				onRemove: () => applyFilters({ ...f, storeId: undefined }),
			});
		}
		if (f.categoryId !== undefined) {
			const category = categoriesQuery.data?.find((c) => c.id === f.categoryId);
			const name = category?.name ?? String(f.categoryId);
			chips.push({
				id: "category",
				label: `Category: ${f.categoryMode === "except" ? `Except ${name}` : name}`,
				onRemove: () => applyFilters({ ...f, categoryId: undefined }),
			});
		}
		if (f.dateFrom || f.dateTo) {
			chips.push({
				id: "date",
				label: `Date: ${dateRangeLabel(f.dateFrom, f.dateTo)}`,
				onRemove: () =>
					applyFilters({ ...f, dateFrom: undefined, dateTo: undefined }),
			});
		}
		return chips;
	};
	const filterChips = filterChipsFor(appliedFilters);

	const applyFilters = (f: QueueFilterValues) => {
		// Only a category the worker picked becomes their rack, not one that
		// came in on a shared link while they changed the date.
		if (
			f.categoryId !== selectedCategoryId ||
			f.categoryMode !== selectedCategoryMode
		) {
			setPersistedCategory(
				currentUserKey,
				f.categoryId === undefined
					? undefined
					: { categoryId: f.categoryId, mode: f.categoryMode },
			);
		}
		void navigate({
			replace: true,
			search: (prev) => ({
				...prev,
				// Unchanged, a worker's fallback Store stays out of the URL, so it
				// isn't saved as a Store they chose.
				storeId: f.storeId === parsedStoreId ? prev.storeId : f.storeId,
				categoryId: f.categoryId,
				categoryMode: f.categoryId === undefined ? undefined : f.categoryMode,
				dateFrom: f.dateFrom,
				dateTo: f.dateTo,
			}),
		});
	};

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
							aria-label={isScanning ? "Stop scan" : "Scan tag"}
							icon={<HugeiconsIcon icon={QrCodeScanIcon} className="size-4" />}
							onClick={() => {
								if (isScanning) {
									stopScan();
									return;
								}

								void startScan();
							}}
							size="icon"
							type="button"
							variant={isScanning ? "default" : "outline"}
						/>
						<FilterPanel
							clear={(f) => ({
								...f,
								categoryId: undefined,
								dateFrom: undefined,
								dateTo: undefined,
								storeId: role === "admin" ? undefined : f.storeId,
							})}
							countOf={(f) => filterChipsFor(f).length}
							onApply={applyFilters}
							value={appliedFilters}
						>
							{(draft, setDraft) => (
								<div className="grid gap-4">
									<StoreSelect
										allowedStoreIds={allowedStoreIds}
										id="queue-store"
										onValueChange={(value) =>
											setDraft({ storeId: value ? Number(value) : undefined })
										}
										placeholder="Select store"
										value={draft.storeId?.toString() ?? ""}
									/>
									<QueueCategoryFilter
										categoryId={draft.categoryId}
										mode={draft.categoryMode}
										onChange={(categoryId, categoryMode) =>
											setDraft({ categoryId, categoryMode })
										}
									/>
									<Field>
										<FieldLabel htmlFor="queue-date">Date</FieldLabel>
										<Suspense fallback={<Skeleton className="h-9 w-full" />}>
											<DateRangePicker
												commitOnComplete
												from={draft.dateFrom}
												fullWidth
												id="queue-date"
												onChange={({ from, to }) =>
													setDraft({ dateFrom: from, dateTo: to })
												}
												onClear={() =>
													setDraft({ dateFrom: undefined, dateTo: undefined })
												}
												placeholder="Any time"
												to={draft.dateTo}
											/>
										</Suspense>
									</Field>
								</div>
							)}
						</FilterPanel>
					</div>

					{scanError ? (
						<div className="flex items-center gap-2 text-destructive text-body">
							<HugeiconsIcon icon={AlertCircleIcon} className="size-4" />
							<span>{scanError}</span>
						</div>
					) : null}

					{isScanning ? (
						<video
							autoPlay
							className="aspect-video w-full rounded-lg object-cover"
							muted
							playsInline
							ref={videoRef}
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

					{filterChips.length > 0 && <FilterChips chips={filterChips} />}
				</StickyControls>

				<section className="grid min-w-0 gap-2">
					{role === "admin" && parsedStoreId === undefined ? (
						<EmptyState icon={Store01Icon}>Select a store</EmptyState>
					) : null}

					{hasQueueItems ? (
						<div
							className={cn(
								"grid min-w-0 gap-2",
								CONTENT_FADE,
								staleFade(queueQuery.isPlaceholderData),
							)}
							key={shownQueueKey}
						>
							{queueRows}
						</div>
					) : null}

					{/* isLoading, never isPending: with no store picked this query is
					    disabled, and a disabled query stays pending forever. */}
					{queueQuery.isLoading ? <QueueSkeleton /> : null}

					{queueQuery.isError ? (
						<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-body">
							{queueQuery.error instanceof Error
								? queueQuery.error.message
								: "Couldn't load the Queue."}
						</div>
					) : null}

					{!queueQuery.isLoading &&
					!queueQuery.isError &&
					!hasQueueItems &&
					parsedStoreId !== undefined ? (
						<EmptyState icon={Task01Icon}>No items.</EmptyState>
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

// A card's shape: the Item over its Order line, then one Service row.
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
