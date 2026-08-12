import {
	CaretRightIcon,
	HourglassIcon,
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { QueueStatusTabs } from "@/features/orders/components/queue-status-tabs";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { useBarcodeScanner } from "@/features/orders/hooks/useBarcodeScanner";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import {
	type FetchOrderServiceQueueQuery,
	fetchOrderDetail,
	fetchOrderServiceQueuePage,
	lookupOrderServiceById,
	lookupOrderServiceByItemCode,
	type QueueOrderServiceItem,
	queryKeys,
} from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { meQueryOptions, storesQueryOptions } from "@/lib/query-options";
import { readServerErrorMessage } from "@/lib/server-error";
import {
	ACTIVE_ORDER_SERVICE_STATUSES,
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
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
const DAY_MS = 24 * HOUR_MS;

type AgeTone = "muted" | "info" | "warning" | "destructive";

function formatElapsedDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60_000);
	if (totalMinutes < 60) {
		return `${Math.max(totalMinutes, 0)}m`;
	}
	const totalHours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (totalHours < 24) {
		return `${totalHours}h ${minutes}m`;
	}
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	return `${days}d ${hours}h`;
}

function getElapsedTone(ms: number): AgeTone {
	if (ms < 2 * HOUR_MS) {
		return "muted";
	}
	if (ms < DAY_MS) {
		return "info";
	}
	if (ms < 3 * DAY_MS) {
		return "warning";
	}
	return "destructive";
}

const AGE_TONE_CLASS: Record<AgeTone, string> = {
	muted: "border-border/70 bg-muted/40 text-muted-foreground",
	info: "border-info/40 bg-info/10 text-info",
	warning: "border-warning/50 bg-warning/10 text-warning",
	destructive: "border-destructive/50 bg-destructive/10 text-destructive",
};

const workerSearchSchema = z.object({
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

export const Route = createFileRoute("/_admin/worker/")({
	validateSearch: (search) => workerSearchSchema.parse(search),
	loader: async ({ context }) => {
		const currentUser = getCurrentUser();

		await Promise.all([
			context.queryClient.ensureQueryData(storesQueryOptions()),
			currentUser
				? context.queryClient.ensureQueryData(meQueryOptions())
				: undefined,
		]);
	},
	component: WorkerQueuePage,
});

function WorkerQueuePage() {
	const currentUser = getCurrentUser();
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const loadMoreRef = useRef<HTMLDivElement | null>(null);

	const [itemCode, setItemCode] = useState("");
	const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

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
				search: (prev: { storeId?: number }) => ({
					...prev,
					storeId: userStoreIds[0],
				}),
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
							workerServiceId: orderService.id,
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
				workerServiceId: orderService.id,
			};
		},
		onSuccess: (result) => {
			if (result.workerServiceId !== undefined) {
				void navigate({
					to: "/worker/$orderId/$serviceId",
					params: {
						orderId: String(result.orderId),
						serviceId: String(result.workerServiceId),
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
				to: "/worker/$orderId/$serviceId",
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
			search: (prev: {
				storeId?: number;
				status?: (typeof ACTIVE_ORDER_SERVICE_STATUSES)[number];
			}) => ({
				...prev,
				storeId: value ? Number(value) : undefined,
			}),
		});
	};

	const updateStatusFilter = (value: string) => {
		void navigate({
			search: (prev: {
				storeId?: number;
				status?: (typeof ACTIVE_ORDER_SERVICE_STATUSES)[number];
				dateFrom?: string;
				dateTo?: string;
			}) => ({
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
			search: (prev: {
				storeId?: number;
				status?: (typeof ACTIVE_ORDER_SERVICE_STATUSES)[number];
				dateFrom?: string;
				dateTo?: string;
			}) => ({
				...prev,
				dateFrom: next.from,
				dateTo: next.to,
			}),
		});
	};

	return (
		<>
			<PageHeader
				title="Queue"
				actions={
					<Badge variant={queueQuery.isLoading ? "secondary" : "outline"}>
						{`${totalItems} items`}
					</Badge>
				}
			/>

			<div className="grid gap-5">
				<section className="grid gap-4 border border-border bg-background/70 p-4">
					<div className="flex justify-end lg:hidden">
						<Dialog
							open={isMobileFilterOpen}
							onOpenChange={setIsMobileFilterOpen}
						>
							<DialogTrigger
								render={
									<Button
										type="button"
										variant="outline"
										className="h-11 px-4"
									/>
								}
							>
								Filters
							</DialogTrigger>
							<DialogContent className="max-w-[calc(100%-1.5rem)] gap-5 p-4">
								<DialogHeader>
									<DialogTitle>Filters</DialogTitle>
								</DialogHeader>
								<div className="grid gap-4">
									<StoreAutocomplete
										id="queue-store-mobile"
										value={parsedStoreId?.toString() ?? ""}
										onValueChange={updateStoreFilter}
										allowedStoreIds={
											role === "admin" ? undefined : userStoreIds
										}
										placeholder="Select store"
									/>

									<QueueStatusTabs
										value={selectedStatus ?? "all"}
										onValueChange={updateStatusFilter}
									/>

									<DateRangePicker
										commitOnComplete
										from={selectedDateFrom}
										to={selectedDateTo}
										onChange={updateDateRangeFilter}
										onClear={() => updateDateRangeFilter()}
									/>

									<Button
										type="button"
										className="h-10 pointer-coarse:h-11"
										onClick={() => setIsMobileFilterOpen(false)}
									>
										Done
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>

					<div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_1fr]">
						<div className="hidden lg:block">
							<StoreAutocomplete
								id="queue-store"
								value={parsedStoreId?.toString() ?? ""}
								onValueChange={updateStoreFilter}
								allowedStoreIds={role === "admin" ? undefined : userStoreIds}
								placeholder="Select store"
							/>
						</div>
						<div className="grid gap-2">
							<Field>
								<FieldLabel htmlFor="queue-item-code">
									Find order item
								</FieldLabel>
								<div className="grid gap-2 lg:flex lg:flex-row">
									<Input
										id="queue-item-code"
										placeholder="Type item code, order ID, or line ID"
										value={itemCode}
										onChange={(event) => setItemCode(event.target.value)}
									/>
									<Button
										type="button"
										variant="outline"
										className="h-10 pointer-coarse:h-11 w-full lg:w-auto lg:min-w-28"
										icon={<MagnifyingGlassIcon className="size-4" />}
										disabled={!itemCode.trim() || lookupMutation.isPending}
										onClick={() => {
											lookupMutation.mutate({
												mode: "manual",
												value: itemCode.trim(),
											});
										}}
									>
										Find
									</Button>
									<Button
										type="button"
										variant="outline"
										className="h-10 pointer-coarse:h-11 w-full lg:w-auto lg:min-w-28"
										icon={<ScanIcon className="size-4" />}
										onClick={() => {
											if (scanner.isScanning) {
												scanner.stop();
												return;
											}

											void scanner.start();
										}}
									>
										{scanner.isScanning ? "Stop Scan" : "Scan Tag"}
									</Button>
								</div>
							</Field>
							{scanner.error ? (
								<div className="flex items-center gap-2 text-sm text-destructive">
									<WarningCircleIcon className="size-4" weight="fill" />
									<span>{scanner.error}</span>
								</div>
							) : null}
						</div>
					</div>

					<QueueStatusTabs
						className="hidden lg:grid"
						value={selectedStatus ?? "all"}
						onValueChange={updateStatusFilter}
					/>

					<div className="hidden lg:block">
						<DateRangePicker
							commitOnComplete
							from={selectedDateFrom}
							to={selectedDateTo}
							onChange={updateDateRangeFilter}
							onClear={() => updateDateRangeFilter()}
						/>
					</div>

					{scanner.isScanning ? (
						<video
							ref={scanner.videoRef}
							className="aspect-video w-full border border-border object-cover"
							autoPlay
							playsInline
							muted
						/>
					) : null}
				</section>

				<section className="grid gap-2">
					{role === "admin" && parsedStoreId === undefined ? (
						<div className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
							Select a store.
						</div>
					) : null}

					{queueItems.map((item) => (
						<QueueRow
							key={item.id}
							item={item}
							currentUserId={currentUser?.id}
							onOpen={navigateToQueueDetail}
						/>
					))}

					{/* isLoading, not isPending: with no store picked the query is
					    disabled, and a disabled query stays pending forever — gating on
					    isPending stacks four skeletons under "Select a store." that never
					    resolve. */}
					{queueQuery.isLoading ? (
						<div className="grid gap-2">
							{Array.from({ length: 4 }, (_, index) => (
								<div
									key={index}
									className="h-28 animate-pulse border border-border bg-muted/40"
								/>
							))}
						</div>
					) : null}

					{queueQuery.isError ? (
						<div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
							{queueQuery.error instanceof Error
								? queueQuery.error.message
								: "Failed to load the queue."}
						</div>
					) : null}

					{!queueQuery.isLoading &&
					!queueQuery.isError &&
					queueItems.length === 0 &&
					parsedStoreId !== undefined ? (
						<div className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
							No items.
						</div>
					) : null}

					<div ref={loadMoreRef} className="h-6" />

					{queueQuery.isFetchingNextPage ? (
						<p className="text-center text-sm text-muted-foreground">
							Loading...
						</p>
					) : null}
				</section>
			</div>
		</>
	);
}

interface WaitingBadgeProps {
	orderCreatedAt: string;
}

const WaitingBadge = ({ orderCreatedAt }: WaitingBadgeProps) => {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(interval);
	}, []);

	const elapsedMs = Math.max(0, now - new Date(orderCreatedAt).getTime());
	const ageTone = getElapsedTone(elapsedMs);
	const ageLabel = formatElapsedDuration(elapsedMs);

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[11px] tabular-nums",
				AGE_TONE_CLASS[ageTone],
			)}
		>
			<HourglassIcon className="size-3" />
			{`Waiting ${ageLabel}`}
		</span>
	);
};

interface QueueRowProps {
	item: QueueOrderServiceItem;
	currentUserId?: number;
	onOpen: (item: QueueOrderServiceItem) => void;
}

const QueueRow = memo(({ item, currentUserId, onOpen }: QueueRowProps) => {
	const isHandledByCurrentUser =
		currentUserId !== undefined && item.handler_id === currentUserId;
	const isHandledByAnotherWorker =
		item.handler_id !== null &&
		item.handler_id !== undefined &&
		!isHandledByCurrentUser;

	const isTerminal = TERMINAL_QUEUE_STATUSES.has(item.status);

	return (
		<button
			type="button"
			className={cn(
				"group grid gap-3 border border-border bg-background px-4 py-4 text-left transition-colors hover:bg-muted/40",
				item.is_priority && "border-warning/40 bg-warning/5",
			)}
			onClick={() => onOpen(item)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="grid gap-2">
					<div className="flex flex-wrap items-center gap-2">
						{item.is_priority ? (
							<Badge variant="warning">Priority</Badge>
						) : (
							<Badge variant="outline">Standard</Badge>
						)}
						<Badge variant={getOrderServiceStatusBadgeVariant(item.status)}>
							{formatOrderServiceStatus(item.status)}
						</Badge>
						<Badge variant={isHandledByCurrentUser ? "info" : "secondary"}>
							{isHandledByCurrentUser
								? "Assigned to me"
								: isHandledByAnotherWorker
									? `Assigned to ${item.handler_name ?? "worker"}`
									: "Open"}
						</Badge>
						{isTerminal ? null : (
							<WaitingBadge orderCreatedAt={item.order_created_at} />
						)}
					</div>
					<div className="grid gap-1">
						<p className="text-lg font-semibold tracking-tight">
							{item.item_code ?? `Service #${item.id}`}
						</p>
						<p className="text-sm text-muted-foreground">{item.service_name}</p>
					</div>
				</div>
				<CaretRightIcon
					className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
					weight="bold"
				/>
			</div>

			<div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
				<p>{`Order ${item.order_code}`}</p>
				<p>{formatOrderDateTime(item.order_created_at)}</p>
				<p>{`Store ${item.store_code} - ${item.store_name}`}</p>
				<p>{`Item ${formatOrderServiceItemDetails(item)}`}</p>
			</div>
		</button>
	);
});
QueueRow.displayName = "QueueRow";
