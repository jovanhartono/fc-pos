import { Badge } from "@/components/ui/badge";
import type { DayClosePayment } from "@/features/counter/api";
import { EarlierTag } from "@/features/counter/components/day-close/earlier-tag";
import {
	AmountCell,
	OrderList,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatClock } from "@/features/counter/lib/day-close";

interface PaymentsSheetContentProps {
	date: string;
	// The method line per payment; null when the sheet is for a single line.
	lineOf: ((payment: DayClosePayment) => string) | null;
	payments: DayClosePayment[];
}

export const PaymentsSheetContent = ({
	date,
	lineOf,
	payments,
}: PaymentsSheetContentProps) => (
	<OrderList emptyText="No payments this day." isEmpty={payments.length === 0}>
		{payments.map((payment) => (
			<OrderRow
				badges={
					<>
						<EarlierTag createdDay={payment.created_day} date={date} />
						{lineOf ? (
							<Badge variant="secondary">{lineOf(payment)}</Badge>
						) : null}
					</>
				}
				code={payment.order_code}
				customerName={payment.customer_name}
				details={[formatClock(payment.paid_at), payment.recorded_by]}
				end={<AmountCell amount={payment.amount} tone="paid" />}
				key={payment.order_id}
				orderId={payment.order_id}
			/>
		))}
	</OrderList>
);
