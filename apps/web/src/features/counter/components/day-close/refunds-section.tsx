import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import type { DayClose } from "@/features/counter/api";
import {
	AmountCell,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatDayShort } from "@/features/counter/lib/day-close";
import { formatRefundReason } from "@/lib/status";
import { formatMoney } from "@/shared/money";

interface RefundsSectionProps {
	data: DayClose;
}

// Every refund shows in full: money leaving the drawer is what the owner
// checks first at the close.
export const RefundsSection = ({ data }: RefundsSectionProps) => {
	const { date, refunds } = data;
	const total = refunds.reduce((sum, refund) => sum + refund.amount, 0);

	return (
		<Section
			count={
				refunds.length > 0 ? (
					<>
						{refunds.length} ·{" "}
						<span className="text-tone-bad-foreground">
							{formatMoney(total)}
						</span>
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
							<OrderRow
								badges={
									refund.paid_day && refund.paid_day !== date ? (
										<Badge variant="warning">
											Paid {formatDayShort(refund.paid_day)}
										</Badge>
									) : null
								}
								className="mx-0 rounded-none px-3"
								code={refund.order_code}
								customerName={refund.customer_name}
								details={[refund.reasons.map(formatRefundReason).join(", ")]}
								end={
									<span className="grid text-right">
										<AmountCell amount={refund.amount} tone="refund" />
										<span className="text-footnote text-muted-foreground">
											{refund.payment_method_name}
										</span>
									</span>
								}
								key={`${refund.order_id}-${refund.refunded_at}`}
								orderId={refund.order_id}
							/>
						))}
					</ul>
				)}
			</div>
		</Section>
	);
};
