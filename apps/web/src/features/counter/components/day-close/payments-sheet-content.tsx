import type { DayClosePayment } from "@/features/counter/api";
import { EarlierTag } from "@/features/counter/components/day-close/earlier-tag";
import {
	AmountCell,
	OrderCustomer,
	OrderList,
	OrderRow,
	PhoneRowContent,
	TimeCell,
} from "@/features/counter/components/day-close/order-row";
import { formatClock } from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";

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
}: PaymentsSheetContentProps) => {
	const isMobile = useIsMobile();
	const columns = lineOf
		? "grid-cols-[3.5rem_minmax(0,1fr)_7rem_9rem_7.5rem]"
		: "grid-cols-[3.5rem_minmax(0,1fr)_9rem_7.5rem]";
	const headings = lineOf
		? ["Time", "Customer", "Method", "Recorded by", "Amount"]
		: ["Time", "Customer", "Recorded by", "Amount"];

	return (
		<OrderList
			columns={columns}
			emptyText="No payments this day."
			headings={headings}
			isEmpty={payments.length === 0}
		>
			{payments.map((payment) => {
				const amount = <AmountCell amount={payment.amount} tone="paid" />;
				const earlier = (
					<EarlierTag createdDay={payment.created_day} date={date} />
				);
				return (
					<OrderRow
						columns={columns}
						code={payment.order_code}
						key={payment.order_id}
						orderId={payment.order_id}
					>
						{isMobile ? (
							<PhoneRowContent
								customerName={payment.customer_name}
								value={amount}
							>
								<span>{formatClock(payment.paid_at)}</span>
								<span>
									<span className="font-mono">{payment.order_code}</span>
									{earlier}
								</span>
								{lineOf ? <span>{lineOf(payment)}</span> : null}
								{payment.recorded_by ? (
									<span>{payment.recorded_by}</span>
								) : null}
							</PhoneRowContent>
						) : (
							<>
								<TimeCell at={payment.paid_at} />
								<OrderCustomer
									code={payment.order_code}
									customerName={payment.customer_name}
								>
									{earlier}
								</OrderCustomer>
								{lineOf ? <span>{lineOf(payment)}</span> : null}
								<span>{payment.recorded_by ?? "–"}</span>
								{amount}
							</>
						)}
					</OrderRow>
				);
			})}
		</OrderList>
	);
};
