import type { DayClosePayment } from "@/features/counter/api";
import { EarlierTag } from "@/features/counter/components/day-close/earlier-tag";
import {
	OrderCode,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatClock } from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

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

	if (isMobile) {
		return (
			<ul>
				{payments.map((payment) => (
					<OrderRow
						className="grid-cols-[minmax(0,1fr)_auto] gap-y-0.5"
						code={payment.order_code}
						key={payment.order_id}
						orderId={payment.order_id}
					>
						<span>
							<OrderCode code={payment.order_code} />
							<EarlierTag createdDay={payment.created_day} date={date} />
						</span>
						<span className="tabular-nums">{formatMoney(payment.amount)}</span>
						<span className="col-span-full text-muted-foreground text-xs">
							{[
								formatClock(payment.paid_at),
								lineOf?.(payment),
								payment.recorded_by,
							]
								.filter(Boolean)
								.join(" · ")}
						</span>
					</OrderRow>
				))}
			</ul>
		);
	}

	const columns = lineOf
		? "grid-cols-[3rem_minmax(0,1fr)_7rem_9rem_7rem]"
		: "grid-cols-[3rem_minmax(0,1fr)_9rem_7rem]";

	return (
		<>
			<div
				className={cn(
					"grid gap-x-3 border-border border-b px-2 py-2 text-muted-foreground text-xs",
					columns,
				)}
			>
				<span>Time</span>
				<span>Order</span>
				{lineOf ? <span>Method</span> : null}
				<span>Recorded by</span>
				<span className="text-right">Amount</span>
			</div>
			<ul className="text-sm">
				{payments.map((payment) => (
					<OrderRow
						className={columns}
						code={payment.order_code}
						key={payment.order_id}
						orderId={payment.order_id}
					>
						<span className="tabular-nums">{formatClock(payment.paid_at)}</span>
						<span>
							<OrderCode code={payment.order_code} />
							<EarlierTag createdDay={payment.created_day} date={date} />
						</span>
						{lineOf ? <span>{lineOf(payment)}</span> : null}
						<span>{payment.recorded_by ?? "–"}</span>
						<span className="text-right tabular-nums">
							{formatMoney(payment.amount)}
						</span>
					</OrderRow>
				))}
			</ul>
		</>
	);
};
