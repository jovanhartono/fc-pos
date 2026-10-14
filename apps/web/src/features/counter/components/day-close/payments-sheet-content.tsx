import { Link } from "@tanstack/react-router";
import type { DayClosePayment } from "@/features/counter/api";
import { formatClock, formatDayShort } from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatMoney } from "@/shared/money";

export const ORDER_CODE_CLASS =
	"font-mono text-xs underline underline-offset-2";

interface PaymentsSheetContentProps {
	date: string;
	// The method line per payment; null when the sheet is for a single line.
	lineOf: ((payment: DayClosePayment) => string) | null;
	payments: DayClosePayment[];
}

interface EarlierTagProps {
	createdDay: string;
}

const EarlierTag = ({ createdDay }: EarlierTagProps) => (
	<span className="ml-1.5 whitespace-nowrap bg-warning/15 px-1.5 text-foreground text-xs">
		Order from {formatDayShort(createdDay)}
	</span>
);

interface OrderCellProps {
	date: string;
	payment: DayClosePayment;
}

const OrderCell = ({ date, payment }: OrderCellProps) => (
	<>
		<Link
			className={ORDER_CODE_CLASS}
			params={{ orderId: String(payment.order_id) }}
			to="/orders/$orderId"
		>
			{payment.order_code}
		</Link>
		{payment.created_day === date ? null : (
			<EarlierTag createdDay={payment.created_day} />
		)}
	</>
);

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
					<li
						className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-border border-b py-2.5"
						key={payment.order_id}
					>
						<span>
							<OrderCell date={date} payment={payment} />
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
					</li>
				))}
			</ul>
		);
	}

	return (
		<table className="w-full text-sm">
			<thead className="text-left text-muted-foreground text-xs">
				<tr className="border-border border-b">
					<th className="py-2 pr-3 font-normal">Time</th>
					<th className="py-2 pr-3 font-normal">Order</th>
					{lineOf ? <th className="py-2 pr-3 font-normal">Method</th> : null}
					<th className="py-2 pr-3 font-normal">Recorded by</th>
					<th className="py-2 text-right font-normal">Amount</th>
				</tr>
			</thead>
			<tbody>
				{payments.map((payment) => (
					<tr className="border-border border-b" key={payment.order_id}>
						<td className="py-2 pr-3 tabular-nums">
							{formatClock(payment.paid_at)}
						</td>
						<td className="py-2 pr-3">
							<OrderCell date={date} payment={payment} />
						</td>
						{lineOf ? <td className="py-2 pr-3">{lineOf(payment)}</td> : null}
						<td className="py-2 pr-3">{payment.recorded_by ?? "–"}</td>
						<td className="py-2 text-right tabular-nums">
							{formatMoney(payment.amount)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
};
