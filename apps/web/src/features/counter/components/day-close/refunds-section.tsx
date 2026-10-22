import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import type { DayClose, DayCloseRefund } from "@/features/counter/api";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import {
	AMOUNT_TONE,
	AmountCell,
	OrderList,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatDayShort } from "@/features/counter/lib/day-close";
import { formatClock } from "@/lib/dayjs";
import { formatRefundReason } from "@/lib/status";
import { formatMoney } from "@/shared/money";

interface RefundsSheetContentProps {
	date: string;
	refunds: DayCloseRefund[];
}

const reasonsOf = (refund: DayCloseRefund) =>
	refund.reasons.map(formatRefundReason).join(", ");

interface PaidWithProps {
	date: string;
	refund: DayCloseRefund;
}

const PaidWith = ({ date, refund }: PaidWithProps) => (
	<>
		{refund.payment_method_name ? (
			<Badge variant="secondary">{refund.payment_method_name}</Badge>
		) : null}
		{refund.paid_day && refund.paid_day !== date ? (
			<Badge variant="warning">Paid {formatDayShort(refund.paid_day)}</Badge>
		) : null}
	</>
);

export const RefundsSheetContent = ({
	date,
	refunds,
}: RefundsSheetContentProps) => (
	<OrderList emptyText="No refunds this day." isEmpty={refunds.length === 0}>
		{refunds.map((refund) => (
			<OrderRow
				badges={<PaidWith date={date} refund={refund} />}
				code={refund.order_code}
				customerName={refund.customer_name}
				details={[formatClock(refund.refunded_at), reasonsOf(refund)]}
				end={<AmountCell amount={refund.amount} tone="refund" />}
				key={`${refund.order_id}-${refund.refunded_at}`}
				orderId={refund.order_id}
			/>
		))}
	</OrderList>
);

interface RefundsSectionProps {
	data: DayClose;
	onOpen: (list: string) => void;
}

export const RefundsSection = ({ data, onOpen }: RefundsSectionProps) => {
	const total = data.refunds.reduce((sum, refund) => sum + refund.amount, 0);

	return (
		<Section title="Refunds">
			<div className="overflow-hidden rounded-lg border bg-card">
				{data.refunds.length === 0 ? (
					<p className="px-3 py-2.5">No refunds this day.</p>
				) : (
					<button
						className="flex w-full items-baseline justify-between gap-3.5 px-3 py-2.5 text-left tabular-nums hover:bg-muted"
						onClick={() => onOpen("refunds")}
						type="button"
					>
						<span>
							Refunds
							<Badge className="ml-2 align-top tabular-nums" variant="outline">
								{data.refunds.length}
							</Badge>
						</span>
						<span className={AMOUNT_TONE.refund}>
							{"−"}
							{formatMoney(total)}
							<OpenArrow />
						</span>
					</button>
				)}
			</div>
		</Section>
	);
};
