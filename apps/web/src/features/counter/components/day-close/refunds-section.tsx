import { Link } from "@tanstack/react-router";
import type { DayClose, DayCloseRefund } from "@/features/counter/api";
import { ORDER_CODE_CLASS } from "@/features/counter/components/day-close/payments-sheet-content";
import {
	formatClock,
	formatDayLong,
	formatDayShort,
	NO_PAYMENT_METHOD,
} from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatRefundReason } from "@/lib/status";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

interface RefundsSheetContentProps {
	date: string;
	refunds: DayCloseRefund[];
}

const reasonsOf = (refund: DayCloseRefund) =>
	refund.reasons.map(formatRefundReason).join(", ");

const methodOf = (refund: DayCloseRefund, date: string) => {
	const name = refund.payment_method_name ?? NO_PAYMENT_METHOD;
	return refund.paid_day && refund.paid_day !== date
		? `${name} on ${formatDayShort(refund.paid_day)}`
		: name;
};

interface RefundCodeProps {
	refund: DayCloseRefund;
}

const RefundCode = ({ refund }: RefundCodeProps) => (
	<Link
		className={ORDER_CODE_CLASS}
		params={{ orderId: String(refund.order_id) }}
		to="/orders/$orderId"
	>
		{refund.order_code}
	</Link>
);

const RefundsSheetContent = ({ date, refunds }: RefundsSheetContentProps) => {
	const isMobile = useIsMobile();

	if (isMobile) {
		return (
			<ul>
				{refunds.map((refund) => (
					<li
						className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-border border-b py-2.5"
						key={`${refund.order_id}-${refund.refunded_at}`}
					>
						<RefundCode refund={refund} />
						<span className="tabular-nums">{formatMoney(refund.amount)}</span>
						<span className="col-span-full text-muted-foreground text-xs">
							{[
								formatClock(refund.refunded_at),
								reasonsOf(refund),
								methodOf(refund, date),
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
					<th className="py-2 pr-3 font-normal">Reason</th>
					<th className="py-2 pr-3 font-normal">Paid with</th>
					<th className="py-2 text-right font-normal">Amount</th>
				</tr>
			</thead>
			<tbody>
				{refunds.map((refund) => (
					<tr
						className="border-border border-b"
						key={`${refund.order_id}-${refund.refunded_at}`}
					>
						<td className="py-2 pr-3 tabular-nums">
							{formatClock(refund.refunded_at)}
						</td>
						<td className="py-2 pr-3">
							<RefundCode refund={refund} />
						</td>
						<td className="py-2 pr-3">{reasonsOf(refund)}</td>
						<td className="py-2 pr-3">{methodOf(refund, date)}</td>
						<td className="py-2 text-right tabular-nums">
							{formatMoney(refund.amount)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
};

interface RefundsSectionProps {
	data: DayClose;
}

export const RefundsSection = ({ data }: RefundsSectionProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	const total = data.refunds.reduce((sum, refund) => sum + refund.amount, 0);

	const handleOpen = () =>
		openSheet({
			title: "Refunds",
			description: `${formatDayLong(data.date)} · ${pluralize(data.refunds.length, "refund")} · ${formatMoney(total)}`,
			size: "wide",
			content: () => (
				<RefundsSheetContent date={data.date} refunds={data.refunds} />
			),
		});

	return (
		<section className="grid gap-2.5">
			<h2 className="font-medium text-[15px]">
				Refunds{" "}
				<span className="font-normal text-muted-foreground">
					· not taken off the totals above
				</span>
			</h2>
			<div className="border border-border">
				{data.refunds.length === 0 ? (
					<p className="px-3 py-2 text-muted-foreground">
						No refunds this day.
					</p>
				) : (
					<button
						className="flex w-full items-baseline justify-between gap-3.5 px-3 py-2 text-left tabular-nums hover:bg-muted"
						onClick={handleOpen}
						type="button"
					>
						<span>Refunds · {data.refunds.length}</span>
						<span>{formatMoney(total)}</span>
					</button>
				)}
			</div>
		</section>
	);
};
