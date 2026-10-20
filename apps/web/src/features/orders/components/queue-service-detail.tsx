import {
	isInWorkshop,
	ORDER_SERVICE_TRANSITIONS,
	ORDER_TERMINAL_SERVICE_STATUSES,
} from "@fresclean/api/schema";
import {
	ArrowClockwiseIcon,
	CaretRightIcon,
	CheckCircleIcon,
	ImageSquareIcon,
	WarningCircleIcon,
	WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CopyValue } from "@/components/copy-value";
import { EmptyState } from "@/components/empty-state";
import { SectionTitle } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CustomerLink } from "@/features/customers/components/customer-link";
import {
	type OrderServiceDetail,
	ordersQueries,
	type UpdateOrderServiceStatusPayload,
} from "@/features/orders/api";
import { HoldToConfirmButton } from "@/features/orders/components/hold-to-confirm-button";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import { PhotoUploadDialog } from "@/features/orders/components/photo-upload-dialog";
import { ReworkOriginCallout } from "@/features/orders/components/rework-origin-callout";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import { useNotifyCustomer } from "@/features/orders/hooks/useNotifyCustomer";
import { useUpdateServiceStatusMutation } from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import { getFirstPickupAt } from "@/features/orders/lib/line-timeline";
import {
	orderLinePhotos,
	startPhotoBlocker,
} from "@/features/orders/lib/order-action-gates";
import { formatNoticeTime } from "@/features/orders/lib/pickup-notice";
import { itemPhotoUploader } from "@/features/orders/utils/photo-upload";
import { onOrderMoved } from "@/lib/cache-events";
import { getOrderServiceItemDescriptors } from "@/lib/order-service-item-details";
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

const LABEL_CLASS = "text-footnote font-medium text-muted-foreground";

interface BackForReworkNoteProps {
	orderId: number;
	reworkLineId: number;
}

const BackForReworkNote = ({
	orderId,
	reworkLineId,
}: BackForReworkNoteProps) => (
	<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-3 text-body">
		<p className="flex items-center gap-2">
			<ArrowClockwiseIcon
				aria-hidden="true"
				className="size-4 shrink-0 text-muted-foreground"
				weight="bold"
			/>
			Back in for a rework.
		</p>
		<Link
			className="flex w-fit items-center gap-0.5 text-footnote text-link"
			params={{ orderId, serviceId: reworkLineId }}
			to="/queue/$orderId/$serviceId"
		>
			Open rework
			<CaretRightIcon aria-hidden="true" className="size-3" />
		</Link>
	</div>
);

const READY_NOTE_CLASS =
	"rounded-lg border border-success/40 bg-tone-good px-3 py-3 text-foreground text-body";

const ReadyIcon = () => (
	<CheckCircleIcon
		aria-hidden="true"
		className="mt-0.5 size-4 shrink-0 text-tone-good-foreground"
		weight="fill"
	/>
);

interface ReadyNoteProps {
	order: OrderServiceDetail["order"];
}

const ReadyNote = ({ order }: ReadyNoteProps) => {
	const notifyCustomer = useNotifyCustomer(order.id);
	const lastNotice = order.last_pickup_notice;
	const isOrderReady = order.status === "ready_for_pickup";

	if (isOrderReady && !lastNotice) {
		return (
			<div className={cn("grid gap-3", READY_NOTE_CLASS)}>
				<p className="flex items-start gap-2">
					<ReadyIcon />
					<span>
						<strong>All Items ready.</strong> Notify {order.customer.name}.
					</span>
				</p>
				<Button
					className="h-12 w-full"
					icon={<WhatsappLogoIcon className="size-4" />}
					onClick={() =>
						notifyCustomer({
							customerName: order.customer.name,
							phone: order.customer.phone_number,
							lastNotice: null,
						})
					}
					type="button"
					variant="success"
				>
					Notify
				</Button>
			</div>
		);
	}

	return (
		<div className={cn("flex items-start gap-2", READY_NOTE_CLASS)}>
			<ReadyIcon />
			{isOrderReady && lastNotice ? (
				<p>
					<strong>Ready.</strong> {order.customer.name} was notified{" "}
					{formatNoticeTime(lastNotice.sent_at)}. Waiting for pickup at the
					counter.
				</p>
			) : (
				<p>
					<strong>Ready.</strong> Waiting for the cashier to complete pickup at
					the counter.
				</p>
			)}
		</div>
	);
};

function QueueServiceDetailSkeleton() {
	return (
		<div className="grid gap-5">
			<Skeleton className="h-8 w-48" />
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
		<EmptyState
			action={
				onRetry ? (
					<Button type="button" variant="outline" onClick={onRetry}>
						Retry
					</Button>
				) : undefined
			}
		>
			<p
				className={cn(
					"font-medium text-foreground",
					tone === "error" && "text-destructive",
				)}
			>
				{title}
			</p>
			<p>{description}</p>
		</EmptyState>
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

	const itemDescriptors = getOrderServiceItemDescriptors(selectedService.item);
	const handlerLabel = isHandledByCurrentUser
		? "You"
		: isHandledByAnotherWorker
			? (selectedService.handler?.name ?? "Another worker")
			: "Unassigned";
	const blockerMessage =
		canStartWork && isHandledByAnotherWorker
			? `${selectedService.handler?.name ?? "Another worker"} is handling this item — actions are locked for you.`
			: (photoBlocker ?? null);
	const isReady = selectedService.status === "ready_for_pickup";
	// Turned down at the counter: the pair left the pickup shelf for its rework.
	const runningRework = selectedService.complaints
		.flatMap((complaint) => complaint.reworkLines)
		.find(isInWorkshop);

	return (
		<>
			<div className="mb-5">
				{/* Two headlines of equal weight: the job, and the object it is done
				    to. A worker needs both to pick the right shoe off the rack, so
				    neither is demoted to small print. The tag is the machine's
				    handle and reads third, in mono. */}
				{itemDescriptors.length > 0 ? (
					// Separator bound to the descriptor before it, so a wrap on a
					// 390px screen never starts a line with a stray "·".
					<p className="mt-1 text-pretty font-bold text-title-1 leading-tight tracking-tight">
						{itemDescriptors.join(" · ")}
					</p>
				) : null}
				<h1 className="text-pretty font-bold text-title-1 leading-tight tracking-tight">
					{selectedService.service?.name ?? "Service"}
				</h1>
				<CopyValue
					className="mt-1 text-muted-foreground"
					label="item tag"
					value={selectedService.item.item_code}
				>
					<span className="break-all text-body tabular-nums">
						{selectedService.item.item_code}
					</span>
				</CopyValue>
				{selectedService.notes?.trim() ? (
					<div className="mt-3 rounded-lg border bg-card px-3 py-2.5">
						<p className={LABEL_CLASS}>Note</p>
						<p className="mt-1 text-body leading-relaxed">
							{selectedService.notes.trim()}
						</p>
					</div>
				) : null}
			</div>

			<div className="grid gap-5">
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2.5">
					<div className="flex flex-wrap items-center gap-2">
						<Badge
							variant={getOrderServiceStatusBadgeVariant(
								selectedService.status,
							)}
						>
							{formatOrderServiceStatus(selectedService.status)}
						</Badge>
						{selectedService.reworkOf !== null && (
							<Badge variant="info">Rework</Badge>
						)}
						{/* A Rework is always Priority, so the badge says nothing there. */}
						{selectedService.reworkOf === null &&
							(selectedService.is_priority ? (
								<Badge variant="priority">Priority</Badge>
							) : (
								<Badge variant="outline">Standard</Badge>
							))}
					</div>
					<p className="text-footnote text-muted-foreground">
						Handler{" "}
						<span className="font-medium text-foreground">{handlerLabel}</span>
					</p>
				</div>

				{selectedService.reworkOf !== null && (
					<ReworkOriginCallout
						firstPickupAt={getFirstPickupAt(
							selectedService.reworkOf,
							selectedService.rework_opened_at,
						)}
						reworkOf={selectedService.reworkOf}
					/>
				)}

				{isReady && runningRework !== undefined && (
					<BackForReworkNote
						orderId={orderId}
						reworkLineId={runningRework.id}
					/>
				)}

				{/* Emerald, the done tone every other screen uses for ready: the
				    workshop's part is finished, and grey read as a warning. */}
				{isReady && runningRework === undefined && <ReadyNote order={detail} />}

				<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
					<div className="grid content-start gap-1 bg-card px-3 py-2.5">
						<dt className={LABEL_CLASS}>Order</dt>
						<dd>
							<CopyValue label="order code" value={detail.code}>
								<Link
									to="/orders/$orderId"
									params={{ orderId: String(orderId) }}
									className="text-body text-link tabular-nums"
								>
									{detail.code}
								</Link>
							</CopyValue>
						</dd>
					</div>
					<div className="grid content-start gap-1 bg-card px-3 py-2.5">
						<dt className={LABEL_CLASS}>Store</dt>
						<dd className="text-body text-foreground">
							{detail.store?.code ?? "-"}
						</dd>
					</div>
					<div className="grid content-start gap-1 bg-card px-3 py-2.5">
						<dt className={LABEL_CLASS}>Customer</dt>
						<dd className="text-body text-foreground">
							<CustomerLink
								customerId={detail.customer.id}
								name={detail.customer.name}
							/>
						</dd>
					</div>
					<div className="grid content-start gap-1 bg-card px-3 py-2.5">
						<dt className={LABEL_CLASS}>Phone</dt>
						<dd className="text-body text-foreground">
							<CopyValue
								label="phone number"
								value={detail.customer.phone_number}
							>
								<a
									href={`tel:${detail.customer.phone_number}`}
									className="text-link tabular-nums"
								>
									{detail.customer.phone_number}
								</a>
							</CopyValue>
						</dd>
					</div>
					<div className="grid content-start gap-1 bg-card px-3 py-2.5">
						<dt className={LABEL_CLASS}>Items ready</dt>
						<dd
							className={cn(
								"text-body tabular-nums",
								detail.items_ready === detail.items_total
									? "text-tone-good-foreground"
									: "text-foreground",
							)}
						>
							{detail.items_ready}/{detail.items_total}
						</dd>
					</div>
					<div className="grid content-start gap-1 bg-card px-3 py-2.5">
						<dt className={LABEL_CLASS}>Received</dt>
						<dd className="text-body text-foreground">
							{formatOrderDateTime(detail.created_at)}
						</dd>
					</div>
				</dl>

				<section className="overflow-hidden rounded-lg border bg-card">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
						<div className="flex items-center gap-2">
							<SectionTitle
								count={selectedService.item.images.length || undefined}
								title="Photos"
							/>
							{needsPhotoToStart && <Badge variant="warning">Required</Badge>}
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
						<OrderPhotoGallery
							items={orderLinePhotos(
								selectedService,
								selectedService.item.images,
							).map((image) => ({
								...image,
								alt:
									image.note ?? `Photo for ${selectedService.item.item_code}`,
								caption: image.isBeforeRework ? (
									<p className="text-muted-foreground text-footnote">
										Before rework
									</p>
								) : undefined,
								download: { kind: "item" as const, id: image.id },
							}))}
							gridClassName="flex snap-x gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-3"
							itemClassName="w-24 shrink-0 snap-start md:w-auto"
							thumbnailClassName="bg-card"
							thumbnailImageClassName="aspect-square md:aspect-[5/4]"
							title={`Photos for ${selectedService.item.item_code}`}
							emptyState={<EmptyState>No photos.</EmptyState>}
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

				<section className="grid gap-4 rounded-lg border bg-card p-4">
					<StatusTimeline line={selectedService} />
					{actionStatuses.length > 0 && (
						<Field>
							<FieldLabel htmlFor="queue-status-note">Status note</FieldLabel>
							<Textarea
								id="queue-status-note"
								placeholder={
									actionStatuses.includes("qc_reject")
										? "Needed to reject, e.g. stain on toe box"
										: "Optional status note"
								}
								value={statusNote}
								onChange={(event) => setStatusNote(event.target.value)}
							/>
						</Field>
					)}
				</section>
			</div>

			{(canStartWork || actionStatuses.length > 0) && (
				<div
					className="sticky bottom-0 z-10 -mx-3 mt-6 border-t border-border bg-background/95 px-3 pb-[calc(var(--inset-bottom)+0.75rem)] pt-3 backdrop-blur sm:-mx-6 sm:px-6 md:mx-0 md:px-0 md:pb-3"
					data-bottom-bar
				>
					{blockerMessage ? (
						<div className="mb-2 flex items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-footnote font-medium text-foreground">
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
								variant={nextStatus === "qc_reject" ? "secondary" : "default"}
								size="lg"
								className={cn("h-12 sm:flex-1", canStartWork && "sm:flex-none")}
								disabled={
									updateStatusMutation.isPending ||
									(nextStatus === "qc_reject" && !statusNote.trim())
								}
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
			)}
		</>
	);
}
