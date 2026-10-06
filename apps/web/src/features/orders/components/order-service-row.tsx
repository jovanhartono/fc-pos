import { isUnpricedLine } from "@fresclean/api/schema";
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
		const openSheet = useSheet((s) => s.openSheet);

		const serviceName = service.service?.name ?? "Service";
		const isNestedRework = reworkRound !== undefined;
		const isRework = Boolean(service.reworkOf);
		// ADR-0018: a blank price holds the whole Order's payment ("no price, no
		// payment") — the same predicate the server's paid transition runs.
		const isUnpriced = isUnpricedLine(service);

		const handleClick = () => {
			openSheet({
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
					"flex w-full items-start gap-3 py-2.5 pr-1 pl-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
					isNestedRework && "pt-1 pl-5",
				)}
				onClick={handleClick}
				type="button"
			>
				{isNestedRework ? (
					<span
						aria-hidden="true"
						className="text-muted-foreground text-sm leading-5"
					>
						└
					</span>
				) : null}
				<span className="min-w-0 flex-1 space-y-1">
					{/* leading-5 matches the 20px badge line across the row, so the
					    service name and the subtotal below share a center. */}
					<span className="block text-sm leading-5">
						{isNestedRework ? (
							<ReworkRoundLabel round={reworkRound} serviceName={serviceName} />
						) : (
							serviceName
						)}
					</span>
					{service.handler?.name ? (
						<span className="block text-muted-foreground text-xs leading-snug">
							{service.handler.name}
						</span>
					) : null}
					{service.notes?.trim() ? (
						<span className="block text-pretty text-xs leading-snug">
							<span className="text-muted-foreground">Note: </span>
							{service.notes.trim()}
						</span>
					) : null}
				</span>
				<span className="flex shrink-0 flex-col items-end gap-1">
					<span className="flex flex-wrap justify-end gap-1.5">
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
					<span className="font-mono text-sm tabular-nums">
						{/* A blank line has no subtotal yet — "Rp 0" would read as
						    deliberately free (a Rework), which it is not. */}
						{isUnpriced ? "—" : formatMoney(service.subtotal)}
					</span>
				</span>
			</button>
		);
	},
);

OrderServiceRow.displayName = "OrderServiceRow";
