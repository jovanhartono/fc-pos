import { TextSkeleton } from "@/components/text-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
	ADD_TILE_CLASS,
	AttachmentLabel,
	CODE_HEADING,
	ITEM_CODE,
	ITEM_NAME,
	LINE_BADGES,
	LINE_GRID,
	LINE_HANDLER,
	LINE_NAME,
	LINE_PRICE,
	META_LINE,
	PAID_LIST,
	PAID_ROW,
	SERVICE_LIST,
	STRIP_CLASS,
	TILE_CLASS,
	TILE_GRID,
	TileCaption,
} from "@/features/orders/components/order-detail-parts";
import { OrderMoneySummarySkeleton } from "@/features/orders/components/order-money-summary";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { cn } from "@/lib/utils";

// The Order sheet shows this while the Order's code downloads, so it must not
// import the cards themselves.

// The header while the Order loads: the code, two status pills, Print and the
// menu in grey, so the sections under it start where they will stay.
const OrderIdentityStripSkeleton = () => (
	<Card className="mb-4 sm:mb-6">
		<CardContent className="grid gap-4">
			<div className="grid gap-2">
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<h1 className={cn(CODE_HEADING, "inline-flex items-center gap-1")}>
							<TextSkeleton className="w-36" />
							<span className="size-6 pointer-coarse:size-7" />
						</h1>
						<Skeleton className="h-5 w-16 rounded-full" />
						<Skeleton className="h-5 w-12 rounded-full" />
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Skeleton className="h-9 w-20 pointer-coarse:h-11" />
						<Skeleton className="size-9 rounded-full pointer-coarse:size-11" />
					</div>
				</div>
				{/* A phone wraps the customer, phone, Store and date onto two lines. */}
				<p className={META_LINE}>
					<TextSkeleton className="w-full sm:w-96" />
					<TextSkeleton className="w-24 sm:hidden" />
				</p>
			</div>
		</CardContent>
	</Card>
);

// One photo and the add tile, the strip most Items carry.
const ItemPhotoStripSkeleton = () => (
	<div className={STRIP_CLASS}>
		<Skeleton className={TILE_CLASS} />
		<div className={cn(TILE_CLASS, ADD_TILE_CLASS)} />
	</div>
);

// One OrderService while the Order loads: name, status pill and price.
const OrderServiceRowSkeleton = () => (
	<div className="flex py-2.5">
		<span className={LINE_GRID}>
			<span className={LINE_NAME}>
				<TextSkeleton className="w-56 max-w-full" />
			</span>
			<span className={LINE_BADGES}>
				<Skeleton className="h-5 w-16 rounded-full" />
			</span>
			<span className={LINE_HANDLER} />
			<span className={LINE_PRICE}>
				<TextSkeleton />
			</span>
		</span>
	</div>
);

// One Item with one Service, what most Orders at the counter carry.
const OrderItemsSkeleton = () => (
	<section className="grid gap-3">
		<OrderSectionHeader>Items</OrderSectionHeader>
		<Card className="gap-0 py-0">
			<header className="min-w-0 px-4 py-3">
				<h3 className={ITEM_NAME}>
					<TextSkeleton className="w-48" />
				</h3>
				<p className={ITEM_CODE}>
					<TextSkeleton className="w-28" />
				</p>
			</header>
			<ItemPhotoStripSkeleton />
			<ul className={SERVICE_LIST}>
				<li>
					<OrderServiceRowSkeleton />
				</li>
			</ul>
		</Card>
	</section>
);

// A paid Order's bill and how it was paid, the shape most open Orders show.
const OrderPaymentSkeleton = () => (
	<section className="grid gap-3">
		<OrderSectionHeader>Payment</OrderSectionHeader>
		<Card className="gap-0 overflow-hidden py-0">
			<OrderMoneySummarySkeleton />
			<Separator />
			<dl className={PAID_LIST}>
				{["Method", "Paid at", "Marked by"].map((label) => (
					<div className={PAID_ROW} key={label}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd>
							<TextSkeleton className="w-24" />
						</dd>
					</div>
				))}
			</dl>
		</Card>
	</section>
);

// A drop-off photo with its time and Replace button, beside the pickup tile.
const OrderAttachmentsSkeleton = () => (
	<section className="grid gap-3">
		<OrderSectionHeader>Attachments</OrderSectionHeader>
		<Card className="gap-4 p-4 text-body">
			<div className={TILE_GRID}>
				{["Drop-off", "Pickup"].map((label) => (
					<div className="grid content-start gap-1.5" key={label}>
						<AttachmentLabel>{label}</AttachmentLabel>
						<Skeleton className="aspect-square w-full rounded-md" />
						<TileCaption
							line1={
								label === "Drop-off" ? (
									<TextSkeleton className="w-32" />
								) : undefined
							}
							line2={
								<span className="inline-flex h-9 items-center pointer-coarse:h-11">
									<TextSkeleton className="w-28" />
								</span>
							}
						/>
					</div>
				))}
			</div>
		</Card>
	</section>
);

// A paid one-Item Order drawn from the real section shells, so each card is
// already its loaded height at every width and nothing moves when it lands.
export const OrderDetailSkeleton = () => (
	<div aria-hidden className="@container/order">
		<OrderIdentityStripSkeleton />
		<div className="grid gap-3 sm:gap-4">
			<OrderItemsSkeleton />
			<OrderPaymentSkeleton />
			<OrderAttachmentsSkeleton />
		</div>
	</div>
);
