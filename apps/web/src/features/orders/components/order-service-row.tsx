import { isUnpricedLine } from "@fresclean/api/rules";
import { ROW_TAP, ROW_TAP_NESTED, RowChevron } from "@/components/message-row";
import { Badge } from "@/components/ui/badge";
import type { OrderDetail } from "@/features/orders/api";
import {
	LINE_BADGES,
	LINE_GRID,
	LINE_HANDLER,
	LINE_NAME,
	LINE_PRICE,
} from "@/features/orders/components/order-detail-parts";
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
	// Set on a Rework drawn under the line it redoes.
	reworkRound?: number;
}

export const OrderServiceRow = ({
	orderId,
	service,
	reworkRound,
}: OrderServiceRowProps) => {
	const openNestedSheet = useSheet((s) => s.openNestedSheet);

	const serviceName = service.service?.name ?? "Service";
	const isNestedRework = reworkRound !== undefined;
	const isRework = Boolean(service.reworkOf);
	// ADR-0018: a blank price holds the whole Order's payment ("no price, no
	// payment") — the same predicate the server's paid transition runs.
	const isUnpriced = isUnpricedLine(service);

	const handleClick = () => {
		openNestedSheet({
			title: serviceName,
			content: () => (
				<OrderServiceDetail orderId={orderId} serviceId={service.id} />
			),
		});
	};

	return (
		<button
			className={cn(ROW_TAP, isNestedRework && ROW_TAP_NESTED)}
			onClick={handleClick}
			type="button"
		>
			{/* On a phone the price sits beside the name and the badges drop
			    to the last line, so no row is spent on the price or the worker. */}
			<span className={LINE_GRID}>
				<span className={LINE_NAME}>
					{isNestedRework ? (
						<ReworkRoundLabel round={reworkRound} serviceName={serviceName} />
					) : (
						serviceName
					)}
				</span>
				<span className={LINE_BADGES}>
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
					{/* On a phone the worker rides the badges line instead of a row of its own. */}
					<span className="text-subhead sm:hidden">
						{service.handler?.name}
					</span>
				</span>
				<span className={LINE_HANDLER}>{service.handler?.name}</span>
				<span className={LINE_PRICE}>
					{/* A blank line has no subtotal yet — "Rp 0" would read as
					    deliberately free (a Rework), which it is not. */}
					{isUnpriced ? "—" : formatMoney(service.subtotal)}
				</span>
				{service.notes?.trim() ? (
					<span className="col-span-2 text-pretty text-subhead leading-snug max-sm:order-2">
						<span className="text-muted-foreground">Note: </span>
						{service.notes.trim()}
					</span>
				) : null}
			</span>
			<RowChevron />
		</button>
	);
};
