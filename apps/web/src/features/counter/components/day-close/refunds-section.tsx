import type { DayClose, DayCloseRefund } from "@/features/counter/api";
import { CountBadge } from "@/features/counter/components/day-close/count-badge";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import {
	OrderCode,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import {
	formatClock,
	formatDayLong,
	formatDayShort,
} from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatRefundReason } from "@/lib/status";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

const COLUMNS = "grid-cols-[3rem_10rem_minmax(0,1fr)_minmax(0,1fr)_7rem]";

interface RefundsSheetContentProps {
	date: string;
	refunds: DayCloseRefund[];
}

const reasonsOf = (refund: DayCloseRefund) =>
	refund.reasons.map(formatRefundReason).join(", ");

const methodOf = (refund: DayCloseRefund, date: string) =>
	refund.paid_day && refund.paid_day !== date
		? `${refund.payment_method_name} on ${formatDayShort(refund.paid_day)}`
		: refund.payment_method_name;

const RefundsSheetContent = ({ date, refunds }: RefundsSheetContentProps) => {
	const isMobile = useIsMobile();

	if (isMobile) {
		return (
			<ul>
				{refunds.map((refund) => (
					<OrderRow
						className="grid-cols-[minmax(0,1fr)_auto] gap-y-0.5"
						code={refund.order_code}
						key={`${refund.order_id}-${refund.refunded_at}`}
						orderId={refund.order_id}
					>
						<OrderCode code={refund.order_code} />
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
					</OrderRow>
				))}
			</ul>
		);
	}

	return (
		<>
			<div
				className={`grid gap-x-3 border-border border-b px-2 py-2 text-muted-foreground text-xs ${COLUMNS}`}
			>
				<span>Time</span>
				<span>Order</span>
				<span>Reason</span>
				<span>Paid with</span>
				<span className="text-right">Amount</span>
			</div>
			<ul className="text-sm">
				{refunds.map((refund) => (
					<OrderRow
						className={COLUMNS}
						code={refund.order_code}
						key={`${refund.order_id}-${refund.refunded_at}`}
						orderId={refund.order_id}
					>
						<span className="tabular-nums">
							{formatClock(refund.refunded_at)}
						</span>
						<OrderCode code={refund.order_code} />
						<span>{reasonsOf(refund)}</span>
						<span>{methodOf(refund, date)}</span>
						<span className="text-right tabular-nums">
							{formatMoney(refund.amount)}
						</span>
					</OrderRow>
				))}
			</ul>
		</>
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
			<h2 className="font-medium text-base">Refunds</h2>
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
						<span>
							Refunds
							<CountBadge count={data.refunds.length} />
						</span>
						<span>
							{formatMoney(total)}
							<OpenArrow />
						</span>
					</button>
				)}
			</div>
		</section>
	);
};
