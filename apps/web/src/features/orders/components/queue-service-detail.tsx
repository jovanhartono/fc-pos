import {
	ORDER_SERVICE_TRANSITIONS,
	ORDER_TERMINAL_SERVICE_STATUSES,
} from "@fresclean/api/schema";
import {
	ArrowLeftIcon,
	CheckCircleIcon,
	ImageSquareIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	ordersQueries,
	type UpdateOrderServiceStatusPayload,
} from "@/features/orders/api";
import { HoldToConfirmButton } from "@/features/orders/components/hold-to-confirm-button";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import { PhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import { useUpdateServiceStatusMutation } from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import { startPhotoBlocker } from "@/features/orders/lib/order-action-gates";
import { itemPhotoUploader } from "@/features/orders/utils/photo-upload";
import { onOrderMoved } from "@/lib/cache-events";
import { getOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";

// Terminal statuses go through dedicated endpoints — the status endpoint
// rejects them, so never offer them as queue actions.
const WORKER_BLOCKED_QUEUE_STATUSES = new Set<
	UpdateOrderServiceStatusPayload["status"]
>(ORDER_TERMINAL_SERVICE_STATUSES);

const LABEL_CLASS =
	"text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground";

function QueueServiceDetailSkeleton() {
	return (
		<div className="grid gap-5">
			<div className="flex items-center gap-3">
				<Skeleton className="size-9" />
				<Skeleton className="h-8 w-48" />
			</div>
			<Skeleton className="h-12 w-full" />
			<div className="grid gap-3">
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		</div>
	);
}

export function QueueServiceDetailMessage({
	description,
	title,
	tone,
	onRetry,
}: {
	description: string;
	title: string;
	tone: "error" | "muted";
	onRetry?: () => void;
}) {
	return (
		<div
			className={cn(
				"grid gap-1 border border-border/70 bg-muted/30 p-6 text-sm",
				tone === "error" && "border-destructive/40 bg-destructive/5",
			)}
		>
			<p className="font-medium">{title}</p>
			<p className="text-muted-foreground">{description}</p>
			{onRetry ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="mt-2 w-fit"
					onClick={onRetry}
				>
					Retry
				</Button>
			) : null}
		</div>
	);
}

type QueueServiceDetailProps = {
	orderId: number;
	serviceId: number;
};

export function QueueServiceDetail({
	orderId,
	serviceId,
}: QueueServiceDetailProps) {
	const queryClient = useQueryClient();
	const currentUser = getCurrentUser();

	const [statusNote, setStatusNote] = useState("");
	const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);

	const detailQuery = useQuery(ordersQueries.orderService(orderId, serviceId));
	const detail = detailQuery.data?.order;
	const selectedService = detailQuery.data?.line;

	const updateStatusMutation = useUpdateServiceStatusMutation(orderId);

	if (detailQuery.isPending) {
		return <QueueServiceDetailSkeleton />;
	}

	// The route's loader already resolved this query before rendering, and its
	// errorComponent handles a missing or failed lookup — this only satisfies
	// the type checker for the case that never happens in practice.
	if (!(detail && selectedService)) {
		return null;
	}

	const isHandledByCurrentUser = selectedService.handler_id === currentUser?.id;
	const isHandledByAnotherWorker =
		selectedService.handler_id !== null &&
		selectedService.handler_id !== undefined &&
		!isHandledByCurrentUser;
	const nextStatuses = ORDER_SERVICE_TRANSITIONS[selectedService.status] ?? [];
	const canStartWork = selectedService.status === "queued";
	const photoBlocker = startPhotoBlocker(selectedService);
	const needsPhotoToStart = photoBlocker !== undefined;
	const actionStatuses = nextStatuses.filter(
		(status) =>
			!WORKER_BLOCKED_QUEUE_STATUSES.has(status) &&
			(!canStartWork || status !== "processing"),
	);

	const itemDetails = getOrderServiceItemDetails(selectedService.item);
	const handlerLabel = isHandledByCurrentUser
		? "You"
		: isHandledByAnotherWorker
			? (selectedService.handler?.name ?? "Another worker")
			: "Unassigned";
	const blockerMessage =
		canStartWork && isHandledByAnotherWorker
			? `${selectedService.handler?.name ?? "Another worker"} is handling this item — actions are locked for you.`
			: (photoBlocker ?? null);

	return (
		<>
			<div className="mb-5 flex items-start gap-3">
				<Link
					to="/queue"
					search={{ storeId: detail.store?.id }}
					className="flex size-9 shrink-0 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<ArrowLeftIcon className="size-4" weight="bold" />
				</Link>
				<div className="min-w-0 flex-1">
					{/* Two headlines of equal weight: the job, and the object it is done
					    to. A worker needs both to pick the right shoe off the rack, so
					    neither is demoted to small print. The tag is the machine's
					    handle and reads third, in mono. flex-wrap so a long status badge
					    drops below a long name on a 390px viewport instead of being
					    clipped by the section's overflow-x-clip. */}
					<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
						<h1 className="text-pretty font-bold text-[1.5rem] leading-tight tracking-tight">
							{selectedService.service?.name ?? "Service"}
						</h1>
						<Badge
							className="mt-1 shrink-0"
							variant={getOrderServiceStatusBadgeVariant(
								selectedService.status,
							)}
						>
							{formatOrderServiceStatus(selectedService.status)}
						</Badge>
					</div>
					{itemDetails ? (
						<p className="text-pretty font-bold text-[1.5rem] leading-tight tracking-tight">
							{itemDetails}
						</p>
					) : null}
					<p className="mt-1 break-all font-mono text-sm text-muted-foreground">
						{selectedService.item.item_code}
					</p>
				</div>
			</div>

			<div className="grid gap-5">
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border border-border bg-muted/40 px-3 py-2.5">
					{selectedService.is_priority ? (
						<Badge variant="warning">Priority</Badge>
					) : (
						<Badge variant="outline">Standard</Badge>
					)}
					<p className="text-xs text-muted-foreground">
						Handler{" "}
						<span className="font-medium text-foreground">{handlerLabel}</span>
					</p>
				</div>

				{/* Emerald, the done tone every other screen uses for ready: the
				    workshop's part is finished, and grey read as a warning. */}
				{selectedService.status === "ready_for_pickup" ? (
					<div className="flex items-start gap-2 border border-emerald-300/60 bg-emerald-50/70 px-3 py-3 text-emerald-900 text-sm dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
						<CheckCircleIcon
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
							weight="fill"
						/>
						<p>
							<strong>Ready.</strong> Waiting for the cashier to complete pickup
							at the counter.
						</p>
					</div>
				) : null}

				<dl className="grid grid-cols-2 gap-px border border-border bg-border">
					<div className="grid content-start gap-1 bg-background px-3 py-2.5">
						<dt className={LABEL_CLASS}>Order</dt>
						<dd>
							<Link
								to="/orders/$orderId"
								params={{ orderId: String(orderId) }}
								className="font-mono text-sm text-foreground underline underline-offset-2 hover:text-muted-foreground"
							>
								{detail.code}
							</Link>
						</dd>
					</div>
					<div className="grid content-start gap-1 bg-background px-3 py-2.5">
						<dt className={LABEL_CLASS}>Store</dt>
						<dd className="text-sm text-foreground">
							{detail.store?.code ?? "-"}
						</dd>
					</div>
					<div className="grid content-start gap-1 bg-background px-3 py-2.5">
						<dt className={LABEL_CLASS}>Customer</dt>
						<dd className="text-sm text-foreground">
							{detail.customer?.name ?? "-"}
						</dd>
					</div>
					<div className="grid content-start gap-1 bg-background px-3 py-2.5">
						<dt className={LABEL_CLASS}>Phone</dt>
						<dd className="text-sm text-foreground">
							{detail.customer?.phone_number ? (
								<a
									href={`tel:${detail.customer.phone_number}`}
									className="font-mono underline underline-offset-2 hover:text-muted-foreground"
								>
									{detail.customer.phone_number}
								</a>
							) : (
								"-"
							)}
						</dd>
					</div>
					<div className="col-span-2 grid content-start gap-1 bg-background px-3 py-2.5">
						<dt className={LABEL_CLASS}>Received</dt>
						<dd className="text-sm text-foreground">
							{formatOrderDateTime(detail.created_at)}
						</dd>
					</div>
				</dl>

				<section className="border border-border bg-background">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
						<div className="flex items-center gap-2">
							<p className={LABEL_CLASS}>Photos</p>
							{needsPhotoToStart ? (
								<Badge variant="warning">Required</Badge>
							) : selectedService.item.images.length > 0 ? (
								<Badge variant="secondary">
									{selectedService.item.images.length}
								</Badge>
							) : null}
						</div>

						<Button
							type="button"
							variant="outline"
							icon={<ImageSquareIcon className="size-4" />}
							onClick={() => setIsPhotoDialogOpen(true)}
						>
							Add photo
						</Button>
					</div>

					<div className="grid gap-3 px-4 pb-4 pt-4">
						{/* Shown whenever the gate is shut, not only when the gallery is
						    empty: a Rework's Item already carries first-visit photos, and
						    the worker needs to hear why those do not count. */}
						{photoBlocker ? (
							<div className="flex items-start gap-2.5 border border-dashed border-warning/50 bg-warning/10 px-4 py-3 text-sm">
								<WarningCircleIcon
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0 text-warning"
									weight="fill"
								/>
								<div className="grid gap-0.5">
									<p className="font-medium text-foreground">
										Photo required to start
									</p>
									<p className="text-muted-foreground">{photoBlocker}</p>
								</div>
							</div>
						) : null}
						<OrderPhotoGallery
							items={selectedService.item.images.map((image) => ({
								...image,
								alt:
									image.note ?? `Photo for ${selectedService.item.item_code}`,
								download: { kind: "item" as const, id: image.id },
							}))}
							gridClassName="grid-cols-2 xl:grid-cols-3"
							thumbnailClassName="bg-background"
							thumbnailImageClassName="aspect-[5/4]"
							title={`Photos for ${selectedService.item.item_code}`}
							emptyState={
								photoBlocker ? null : (
									<p className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
										No photos.
									</p>
								)
							}
						/>
					</div>
				</section>

				<PhotoUploadDialog
					open={isPhotoDialogOpen}
					onOpenChange={setIsPhotoDialogOpen}
					title="Add item photo"
					badgeLabel={selectedService.item.item_code}
					uploader={itemPhotoUploader(orderId, selectedService.item.id)}
					onUploaded={async () => {
						await onOrderMoved(queryClient);
					}}
				/>

				<section className="grid gap-4 border border-border p-4">
					<StatusTimeline logs={selectedService.statusLogs} />
					<Field>
						<FieldLabel htmlFor="queue-status-note">Status note</FieldLabel>
						<Textarea
							id="queue-status-note"
							placeholder="Optional status note"
							value={statusNote}
							onChange={(event) => setStatusNote(event.target.value)}
						/>
					</Field>
				</section>
			</div>

			<div className="sticky bottom-0 z-10 mt-6 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur sm:px-0 sm:pb-3">
				{blockerMessage ? (
					<div className="mb-2 flex items-center gap-2 border border-warning/50 bg-warning/10 px-3 py-2 text-xs font-medium text-foreground">
						<WarningCircleIcon
							aria-hidden="true"
							className="size-4 shrink-0 text-warning"
							weight="fill"
						/>
						{blockerMessage}
					</div>
				) : null}
				<div className="flex flex-col gap-2 sm:flex-row">
					{canStartWork ? (
						<HoldToConfirmButton
							className="h-12 sm:flex-1"
							disabled={isHandledByAnotherWorker || needsPhotoToStart}
							loading={updateStatusMutation.isPending}
							onComplete={() => {
								updateStatusMutation.mutate(
									{ serviceId, payload: { status: "processing" } },
									{ onSuccess: () => toast.success("Work started") },
								);
							}}
						>
							Hold to Start Work
						</HoldToConfirmButton>
					) : null}

					{actionStatuses.map((nextStatus) => (
						<Button
							key={nextStatus}
							type="button"
							variant="secondary"
							size="lg"
							className={cn("h-12 sm:flex-1", canStartWork && "sm:flex-none")}
							disabled={updateStatusMutation.isPending}
							onClick={() => {
								updateStatusMutation.mutate(
									{
										serviceId,
										payload: {
											status: nextStatus,
											note: statusNote.trim() || undefined,
										},
									},
									{
										onSuccess: () => {
											toast.success("Status updated");
											setStatusNote("");
										},
									},
								);
							}}
						>
							{`Set ${formatOrderServiceStatus(nextStatus)}`}
						</Button>
					))}
				</div>
			</div>
		</>
	);
}
