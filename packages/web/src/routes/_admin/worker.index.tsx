import {
	CaretRightIcon,
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
import { DateRangeFilter } from "@/features/orders/components/date-range-filter";
import {
	type FetchOrderServiceQueueQuery,
	fetchOrderServiceQueuePage,
	lookupOrderServiceByItemCode,
	type QueueOrderServiceItem,
	queryKeys,
} from "@/lib/api";
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

	useEffect(() => {
		const node = loadMoreRef.current;
		if (!node || !queueQuery.hasNextPage || queueQuery.isFetchingNextPage) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const [entry] = entries;
				if (entry?.isIntersecting) {
					void queueQuery.fetchNextPage();
				}
			},
			{ rootMargin: "240px 0px" },
		);

		observer.observe(node);

		return () => observer.disconnect();
	}, [
		queueQuery.fetchNextPage,
		queueQuery.hasNextPage,
		queueQuery.isFetchingNextPage,
	]);

	const lookupMutation = useMutation({
		mutationFn: lookupOrderServiceByItemCode,
		onSuccess: (data) => {
			if (!data.order) {
				toast.error("Order service not found");
				return;
			}

			void navigate({
				to: "/orders/$orderId",
				params: {
					orderId: String(data.order.id),
				},
				search: {
					queueStoreId: data.order.store_id,
					workerServiceId: data.id,
				},
			});
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to find item code");
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
						await lookupMutation.mutateAsync(rawValue);
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

	const updateDateRangeFilter = ({
		dateFrom,
		dateTo,
	}: {
		dateFrom?: string;
		dateTo?: string;
	}) => {
		void navigate({
			search: (prev: {
				storeId?: number;
				status?: (typeof QUEUE_STATUS_OPTIONS)[number];
				dateFrom?: string;
				dateTo?: string;
			}) => ({
				...prev,
				dateFrom,
				dateTo,
			}),
		});
	};

	const clearDateRangeFilter = () => {
		void navigate({
			search: (prev: {
				storeId?: number;
				status?: (typeof QUEUE_STATUS_OPTIONS)[number];
				dateFrom?: string;
				dateTo?: string;
			}) => ({
				...prev,
				dateFrom: undefined,
				dateTo: undefined,
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
												className="h-11 w-full"
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

									<DateRangeFilter
										dateFrom={selectedDateFrom}
										dateTo={selectedDateTo}
										onRangeChange={updateDateRangeFilter}
										onClear={clearDateRangeFilter}
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
									<SelectTrigger id="queue-store" className="h-11 w-full">
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
									Find shoe item
								</FieldLabel>
								<div className="flex flex-col gap-2 sm:flex-row">
									<Input
										id="queue-item-code"
										placeholder="Scan or type item code"
										value={itemCode}
										onChange={(event) => setItemCode(event.target.value)}
										className="h-11"
									/>
									<Button
										type="button"
										variant="outline"
										className="sm:min-w-28"
										icon={
											<MagnifyingGlassIcon
												className="size-4"
												weight="duotone"
											/>
										}
										disabled={!itemCode.trim() || lookupMutation.isPending}
										onClick={async () => {
											await lookupMutation.mutateAsync(itemCode.trim());
										}}
									>
										Find
									</Button>
									<Button
										type="button"
										variant="outline"
										className="sm:min-w-28"
										icon={<ScanIcon className="size-4" weight="duotone" />}
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
						<DateRangeFilter
							dateFrom={selectedDateFrom}
							dateTo={selectedDateTo}
							onRangeChange={updateDateRangeFilter}
							onClear={clearDateRangeFilter}
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
	onOpen,
}: {
	item: QueueOrderServiceItem;
	currentUserId?: number;
	onOpen: () => void;
}) {
	const isHandledByCurrentUser =
		currentUserId !== undefined && item.handler_id === currentUserId;
	const isHandledByAnotherWorker =
		item.handler_id !== null &&
		item.handler_id !== undefined &&
		!isHandledByCurrentUser;

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
				<p>{`Item ${item.color ?? "-"} / ${item.shoe_brand ?? "-"} / ${item.shoe_size ?? "-"}`}</p>
			</div>
		</button>
	);
}
