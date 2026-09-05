import { isUnpricedLine } from "@fresclean/api/schema";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { OrderServiceDetail } from "@/features/orders/components/order-service-detail";
import type { OrderDetail } from "@/lib/api";
import { formatOrderServiceStatus } from "@/lib/status";
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
	// The object's rolled-up status; a treatment names its own only when it
	// disagrees with this.
	itemStatus: string;
}

export const OrderServiceRow = memo(
	({ orderId, service, itemCode, itemStatus }: OrderServiceRowProps) => {
		const openSheet = useSheet((s) => s.openSheet);

		const serviceName = service.service?.name ?? "Service";
		const isRework = Boolean(service.reworkOf);
		// A line carries at most one complaint, lifetime (ADR-0013 amendment) —
		// existence is the whole signal; the complaint has no status.
		const hasComplaint = (service.complaints ?? []).length > 0;
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
				className="flex w-full items-start gap-3 py-2.5 pr-1 pl-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
				onClick={handleClick}
				type="button"
			>
				<span className="min-w-0 flex-1 space-y-1">
					{/* leading-5 matches the 20px badge line across the row, so the
					    service name and the subtotal below share a center. */}
					<span className="block text-sm leading-5">
						{serviceName}
						{service.status === itemStatus ? null : (
							<span className="text-muted-foreground">
								{" "}
								· {formatOrderServiceStatus(service.status)}
							</span>
						)}
					</span>
					{service.handler?.name ? (
						<span className="block text-muted-foreground text-xs leading-snug">
							{service.handler.name}
						</span>
					) : null}
				</span>
				<span className="flex shrink-0 flex-col items-end gap-1">
					<span className="flex flex-wrap justify-end gap-1.5">
						{isUnpriced ? <Badge variant="warning">Unpriced</Badge> : null}
						{isRework ? <Badge variant="info">Rework</Badge> : null}
						{hasComplaint ? <Badge variant="danger">Complaint</Badge> : null}
						{service.is_priority ? (
							<Badge variant="warning">Priority</Badge>
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
