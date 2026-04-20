import {
	CaretRightIcon,
	HourglassIcon,
	MagnifyingGlassIcon,
	ScanIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import {
	currentUserDetailQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";

const QUEUE_PAGE_SIZE = 20;
const QUEUE_STATUS_OPTIONS = [
	"queued",
	"processing",
	"quality_check",
	"ready_for_pickup",
] as const;

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
	status: z.enum(QUEUE_STATUS_OPTIONS).optional(),
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

type BarcodeDetectorLike = {
	detect: (input: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type WindowWithBarcodeDetector = typeof window & {
	BarcodeDetector?: new (...args: unknown[]) => BarcodeDetectorLike;
};

export const Route = createFileRoute("/_admin/worker/")({
	validateSearch: (search) => workerSearchSchema.parse(search),
	loader: async ({ context }) => {
		const currentUser = getCurrentUser();
		await context.queryClient.ensureQueryData(storesQueryOptions());

		if (currentUser) {
			await context.queryClient.ensureQueryData(
				currentUserDetailQueryOptions(currentUser.id),
			);
		}
	},
	component: WorkerQueuePage,
});

function WorkerQueuePage() {
	const currentUser = getCurrentUser();
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const loadMoreRef = useRef<HTMLDivElement | null>(null);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(interval);
	}, []);

	const [itemCode, setItemCode] = useState("");
	const [isScanning, setIsScanning] = useState(false);
	const [scanError, setScanError] = useState<string | null>(null);
	const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const rafRef = useRef<number | null>(null);
	const scanningRef = useRef(false);

	const storesQuery = useQuery(storesQueryOptions());
	const currentUserDetailQuery = useQuery({
		...currentUserDetailQueryOptions(currentUser?.id ?? -1),
		enabled: !!currentUser,
	});

	const userStoreIds = useMemo(
		() =>
			currentUserDetailQuery.data?.userStores.map((item) => item.store_id) ??
			[],
		[currentUserDetailQuery.data],
	);

	useEffect(() => {
		if (!currentUser || search.storeId !== undefined) {
			return;
		}

		if (currentUser.role === "admin") {
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
	}, [currentUser, navigate, search.storeId, userStoreIds]);

	const parsedStoreId = useMemo(() => {
		if (search.storeId !== undefined) {
			return search.storeId;
		}

		if (currentUser?.role === "admin") {
			return undefined;
		}

		return userStoreIds[0];
	}, [currentUser?.role, search.storeId, userStoreIds]);
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
	queueQueryRef.current = queueQuery;

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
			void navigate({
				to: "/orders/$orderId",
				params: {
					orderId: String(result.orderId),
				},
				search: {
					queueStoreId: result.storeId,
					...(result.workerServiceId !== undefined
						? { workerServiceId: result.workerServiceId }
						: {}),
				},
			});
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to find item, order, or line");
		},
	});

	const stopScanner = () => {
		scanningRef.current = false;
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}

		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}

		setIsScanning(false);
	};

	useEffect(() => {
		return () => {
			scanningRef.current = false;
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}

			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) {
					track.stop();
				}
				streamRef.current = null;
			}
		};
	}, []);

	const startScanner = async () => {
		setScanError(null);
		const windowWithBarcodeDetector = window as WindowWithBarcodeDetector;

		if (!windowWithBarcodeDetector.BarcodeDetector) {
			setScanError("Barcode scanner is not supported on this browser.");
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
			});
			streamRef.current = stream;
			scanningRef.current = true;
			setIsScanning(true);

			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}

			const detector = new windowWithBarcodeDetector.BarcodeDetector();

			const detect = async () => {
				if (!videoRef.current || !scanningRef.current) {
					return;
				}

				try {
					const codes = await detector.detect(videoRef.current);
					const rawValue = codes.find((item) => !!item.rawValue)?.rawValue;

					if (rawValue) {
						stopScanner();
						setItemCode(rawValue);
						await lookupMutation.mutateAsync({
							mode: "scan",
							value: rawValue,
						});
						return;
					}
				} catch {
					// ignore frame-level errors
				}

				rafRef.current = requestAnimationFrame(() => {
					void detect();
				});
			};

			rafRef.current = requestAnimationFrame(() => {
				void detect();
			});
		} catch {
			setScanError("Unable to access camera.");
			stopScanner();
		}
	};

	const visibleStores =
		currentUser?.role === "admin"
			? (storesQuery.data ?? [])
			: (storesQuery.data ?? []).filter((store) =>
					userStoreIds.includes(store.id),
				);
	const storeSelectItems = useMemo(
		() =>
			visibleStores.map((store) => ({
				value: String(store.id),
				label: `${store.code} - ${store.name}`,
			})),
		[visibleStores],
	);
	const statusTabItems = useMemo(
		() => [
			{ value: "all", label: "All active statuses" },
			...QUEUE_STATUS_OPTIONS.map((status) => ({
				value: status,
				label: formatOrderServiceStatus(status),
			})),
		],
		[],
	);

	const queueItems =
		queueQuery.data?.pages.flatMap((page) => page.items) ??
		([] as QueueOrderServiceItem[]);
	const totalItems = queueQuery.data?.pages[0]?.meta.total ?? 0;

	const navigateToQueueDetail = (item: QueueOrderServiceItem) => {
		void navigate({
			to: "/orders/$orderId",
			params: {
				orderId: String(item.order_id),
			},
			search: {
				queueStoreId: item.store_id,
				workerServiceId: item.id,
			},
		});
	};

	const updateStoreFilter = (value: string) => {
		void navigate({
			search: (prev: {
				storeId?: number;
				status?: (typeof QUEUE_STATUS_OPTIONS)[number];
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
				status?: (typeof QUEUE_STATUS_OPTIONS)[number];
				dateFrom?: string;
				dateTo?: string;
			}) => ({
				...prev,
				status:
					value && value !== "all"
						? (value as (typeof QUEUE_STATUS_OPTIONS)[number])
						: undefined,
			}),
		});
	};

	const updateDateRangeFilter = (next: { from?: string; to?: string } = {}) => {
		void navigate({
			search: (prev: {
				storeId?: number;
				status?: (typeof QUEUE_STATUS_OPTIONS)[number];
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
					<Badge variant={queueQuery.isPending ? "secondary" : "outline"}>
						{`${totalItems} items`}
					</Badge>
				}
			/>

			<div className="grid gap-5">
				<section className="grid gap-4 border border-border bg-background/70 p-4">
					<div className="flex justify-end md:hidden">
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
									<Field>
										<FieldLabel htmlFor="queue-store-mobile">Store</FieldLabel>
										<Select
											items={storeSelectItems}
											value={parsedStoreId?.toString() ?? ""}
											onValueChange={updateStoreFilter}
										>
											<SelectTrigger
												id="queue-store-mobile"
												size="lg"
												className="w-full"
											>
												<SelectValue placeholder="Select store" />
											</SelectTrigger>
											<SelectContent>
												{visibleStores.map((store) => (
													<SelectItem key={store.id} value={String(store.id)}>
														{`${store.code} - ${store.name}`}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</Field>

									<div className="grid gap-2">
										<p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
											Status
										</p>
										<div className="-mx-1 overflow-x-auto pb-1">
											<div
												role="tablist"
												aria-label="Queue status"
												className="flex min-w-max gap-2 px-1"
											>
												{statusTabItems.map((status) => {
													const isActive =
														(selectedStatus ?? "all") === status.value;

													return (
														<Button
															key={status.value}
															type="button"
															variant={isActive ? "default" : "outline"}
															size="lg"
															role="tab"
															aria-selected={isActive}
															className={cn(
																"h-11 px-4 text-sm",
																isActive
																	? "border-primary bg-primary text-primary-foreground shadow-sm"
																	: "border-border/80 bg-background text-foreground/70 hover:border-foreground/20 hover:bg-muted/70 hover:text-foreground",
															)}
															onClick={() => updateStatusFilter(status.value)}
														>
															{status.label}
														</Button>
													);
												})}
											</div>
										</div>
									</div>

									<DateRangePicker
										commitOnComplete
										from={selectedDateFrom}
										to={selectedDateTo}
										onChange={updateDateRangeFilter}
										onClear={() => updateDateRangeFilter()}
									/>

									<Button
										type="button"
										className="h-11"
										onClick={() => setIsMobileFilterOpen(false)}
									>
										Done
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>

					<div className="grid gap-3 md:grid-cols-[minmax(0,220px)_1fr]">
						<div className="hidden md:block">
							<Field>
								<FieldLabel htmlFor="queue-store">Store</FieldLabel>
								<Select
									items={storeSelectItems}
									value={parsedStoreId?.toString() ?? ""}
									onValueChange={updateStoreFilter}
								>
									<SelectTrigger id="queue-store" size="lg" className="w-full">
										<SelectValue placeholder="Select store" />
									</SelectTrigger>
									<SelectContent>
										{visibleStores.map((store) => (
											<SelectItem key={store.id} value={String(store.id)}>
												{`${store.code} - ${store.name}`}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
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
										className="h-11"
									/>
									<Button
										type="button"
										variant="outline"
										className="h-11 w-full lg:w-auto lg:min-w-28"
										icon={<MagnifyingGlassIcon className="size-4" />}
										disabled={!itemCode.trim() || lookupMutation.isPending}
										onClick={async () => {
											await lookupMutation.mutateAsync({
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
										className="h-11 w-full lg:w-auto lg:min-w-28"
										icon={<ScanIcon className="size-4" />}
										onClick={async () => {
											if (isScanning) {
												stopScanner();
												return;
											}

											await startScanner();
										}}
									>
										{isScanning ? "Stop Scan" : "Scan Tag"}
									</Button>
								</div>
							</Field>
							{scanError ? (
								<div className="flex items-center gap-2 text-sm text-destructive">
									<WarningCircleIcon className="size-4" weight="fill" />
									<span>{scanError}</span>
								</div>
							) : null}
						</div>
					</div>

					<div className="hidden gap-2 md:grid">
						<p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
							Status
						</p>
						<div className="-mx-1 overflow-x-auto pb-1">
							<div
								id="queue-status-tabs"
								role="tablist"
								aria-label="Queue status"
								className="flex min-w-max gap-2 px-1"
							>
								{statusTabItems.map((status) => {
									const isActive = (selectedStatus ?? "all") === status.value;

									return (
										<Button
											key={status.value}
											type="button"
											variant={isActive ? "default" : "outline"}
											size="lg"
											role="tab"
											aria-selected={isActive}
											className={cn(
												"h-11 px-4 text-sm",
												isActive
													? "border-primary bg-primary text-primary-foreground shadow-sm"
													: "border-border/80 bg-background text-foreground/70 hover:border-foreground/20 hover:bg-muted/70 hover:text-foreground",
											)}
											onClick={() => updateStatusFilter(status.value)}
										>
											{status.label}
										</Button>
									);
								})}
							</div>
						</div>
					</div>

					<div className="hidden md:block">
						<DateRangePicker
							commitOnComplete
							from={selectedDateFrom}
							to={selectedDateTo}
							onChange={updateDateRangeFilter}
							onClear={() => updateDateRangeFilter()}
						/>
					</div>

					{isScanning ? (
						<video
							ref={videoRef}
							className="aspect-video w-full border border-border object-cover"
							autoPlay
							playsInline
							muted
						/>
					) : null}
				</section>

				<section className="grid gap-2">
					{currentUser?.role === "admin" && parsedStoreId === undefined ? (
						<div className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
							Select a store.
						</div>
					) : null}

					{queueItems.map((item) => (
						<QueueRow
							key={item.id}
							item={item}
							currentUserId={currentUser?.id}
							now={now}
							onOpen={() => navigateToQueueDetail(item)}
						/>
					))}

					{queueQuery.isPending ? (
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

					{!queueQuery.isPending &&
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

function QueueRow({
	item,
	currentUserId,
	now,
	onOpen,
}: {
	item: QueueOrderServiceItem;
	currentUserId?: number;
	now: number;
	onOpen: () => void;
}) {
	const isHandledByCurrentUser =
		currentUserId !== undefined && item.handler_id === currentUserId;
	const isHandledByAnotherWorker =
		item.handler_id !== null &&
		item.handler_id !== undefined &&
		!isHandledByCurrentUser;

	const isTerminal = TERMINAL_QUEUE_STATUSES.has(item.status);
	const elapsedMs = Math.max(
		0,
		now - new Date(item.order_created_at).getTime(),
	);
	const ageTone = getElapsedTone(elapsedMs);
	const ageLabel = formatElapsedDuration(elapsedMs);

	return (
		<button
			type="button"
			className={cn(
				"group grid gap-3 border border-border bg-background px-4 py-4 text-left transition-colors hover:bg-muted/40",
				item.is_priority && "border-warning/40 bg-warning/5",
			)}
			onClick={onOpen}
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
							<span
								className={cn(
									"inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[11px] tabular-nums",
									AGE_TONE_CLASS[ageTone],
								)}
							>
								<HourglassIcon className="size-3" />
								{`Waiting ${ageLabel}`}
							</span>
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
				<p>
					{new Date(item.order_created_at).toLocaleString("en-ID", {
						dateStyle: "medium",
						timeStyle: "short",
					})}
				</p>
				<p>{`Store ${item.store_code} - ${item.store_name}`}</p>
				<p>{`Item ${formatOrderServiceItemDetails(item)}`}</p>
			</div>
		</button>
	);
}
