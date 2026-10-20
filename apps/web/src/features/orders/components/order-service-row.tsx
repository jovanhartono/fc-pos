import { isUnpricedLine } from "@fresclean/api/schema";
import { CaretRightIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import type { OrderDetail } from "@/features/orders/api";
import { OrderServiceDetail } from "@/features/orders/components/order-service-detail";
import { ReworkRoundLabel } from "@/features/orders/components/rework-round-label";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";
import { useSheet } from "@/stores/sheet-store";

type OrderServiceRowService = OrderDetail["items"][number]["services"][number];

interface OrderServiceRowProps {
	orderId: number;
	service: OrderServiceRowService;
	// The tag of the object this treatment is applied to. Rendered once on the
	// Item header above, but the sheet still opens under it so a worker knows
	// which thing on the shelf they are looking at (ADR-0017).
	itemCode: string;
	// Set on a Rework drawn under the line it redoes.
	reworkRound?: number;
}

export const OrderServiceRow = memo(
	({ orderId, service, itemCode, reworkRound }: OrderServiceRowProps) => {
		const openNestedSheet = useSheet((s) => s.openNestedSheet);

		const serviceName = service.service?.name ?? "Service";
		const isNestedRework = reworkRound !== undefined;
		const isRework = Boolean(service.reworkOf);
		// ADR-0018: a blank price holds the whole Order's payment ("no price, no
		// payment") — the same predicate the server's paid transition runs.
		const isUnpriced = isUnpricedLine(service);

		const handleClick = () => {
			openNestedSheet({
				title: itemCode,
				description: serviceName,
				content: () => (
					<OrderServiceDetail orderId={orderId} serviceId={service.id} />
				),
			});
		};

		return (
			<button
				className={cn(
					"-mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
					isNestedRework && "pt-1",
				)}
				onClick={handleClick}
				type="button"
			>
				{isNestedRework ? (
					<span
						aria-hidden="true"
						className="text-muted-foreground text-body leading-5 compact:text-subhead"
					>
						└
					</span>
				) : null}
				{/* On a phone the badges drop to their own line, so a long
				    treatment name gets the full width instead of wrapping. */}
				<span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
					<span className="text-body leading-5 compact:text-subhead max-sm:col-span-2">
						{isNestedRework ? (
							<ReworkRoundLabel round={reworkRound} serviceName={serviceName} />
						) : (
							serviceName
						)}
					</span>
					<span className="flex flex-wrap justify-end gap-1.5 max-sm:order-last max-sm:col-span-2 max-sm:justify-start">
						{/* Every line names its own status: the Item's rolled-up one
						    hid the line's whenever the two agreed. */}
						<Badge variant={getOrderServiceStatusBadgeVariant(service.status)}>
							{formatOrderServiceStatus(service.status)}
						</Badge>
						{isUnpriced ? <Badge variant="warning">Unpriced</Badge> : null}
						{isRework && !isNestedRework ? (
							<Badge variant="info">Rework</Badge>
						) : null}
						{service.is_priority && !isRework ? (
							<Badge variant="priority">Priority</Badge>
						) : null}
					</span>
					<span className="min-w-0 text-foreground text-subhead leading-snug">
						{service.handler?.name}
					</span>
					<span className="flex items-center gap-1 justify-self-end text-body tabular-nums compact:text-subhead">
						{/* A blank line has no subtotal yet — "Rp 0" would read as
						    deliberately free (a Rework), which it is not. */}
						{isUnpriced ? "—" : formatMoney(service.subtotal)}
						<CaretRightIcon
							aria-hidden="true"
							className="size-3.5 text-muted-foreground/50 sm:hidden"
						/>
					</span>
					{service.notes?.trim() ? (
						<span className="col-span-2 text-pretty text-subhead leading-snug">
							<span className="text-muted-foreground">Note: </span>
							{service.notes.trim()}
						</span>
					) : null}
				</span>
			</button>
		);
	},
);

OrderServiceRow.displayName = "OrderServiceRow";
