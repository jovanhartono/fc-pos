import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import type { DayClose } from "@/features/counter/api";
import { AmountCell } from "@/features/counter/components/day-close/order-row";
import { formatDayShort } from "@/features/counter/lib/day-close";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { useOpenNestedOrder } from "@/features/orders/hooks/useOpenNestedOrder";
import { formatRefundReason } from "@/lib/status";

interface RefundsSectionProps {
	data: DayClose;
}

// Every refund shows in full: money leaving the drawer is what the owner
// checks first at the close.
export const RefundsSection = ({ data }: RefundsSectionProps) => {
	const { date, refunds } = data;
	const total = refunds.reduce((sum, refund) => sum + refund.amount, 0);
	const openOrder = useOpenNestedOrder();

	return (
		<Section
			count={
				refunds.length > 0 ? (
					<>
						{refunds.length} · <AmountCell amount={total} tone="refund" />
					</>
				) : null
			}
			title="Refunds"
		>
			<div className="overflow-hidden rounded-lg border bg-card">
				{refunds.length === 0 ? (
					<p className="px-3 py-2.5">No refunds this day.</p>
				) : (
					<ul className="divide-y divide-border">
						{refunds.map((refund) => (
							<li key={`${refund.order_id}-${refund.refunded_at}`}>
								<OrderListRow
									badges={
										refund.paid_day && refund.paid_day !== date ? (
											<Badge variant="warning">
												Paid {formatDayShort(refund.paid_day)}
											</Badge>
										) : null
									}
									className="rounded-none px-3"
									details={[
										refund.order_code,
										refund.reasons.map(formatRefundReason).join(", "),
									]}
									end={<AmountCell amount={refund.amount} tone="refund" />}
									onClick={(event) =>
										openOrder(event, refund.order_id, refund.order_code)
									}
									params={{ orderId: String(refund.order_id) }}
									title={refund.customer_name}
									to="/orders/$orderId"
								/>
							</li>
						))}
					</ul>
				)}
			</div>
		</Section>
	);
};
