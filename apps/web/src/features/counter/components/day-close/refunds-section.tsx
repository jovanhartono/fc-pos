import type { DayClose, DayCloseRefund } from "@/features/counter/api";
import { CountBadge } from "@/features/counter/components/day-close/count-badge";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import {
	AMOUNT_TONE,
	AmountCell,
	OrderCustomer,
	OrderList,
	OrderRow,
	PhoneRowContent,
	Tag,
	TimeCell,
} from "@/features/counter/components/day-close/order-row";
import { formatClock, formatDayShort } from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatRefundReason } from "@/lib/status";
import { formatMoney } from "@/shared/money";

const COLUMNS = "grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_11rem_7.5rem]";

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
	<span>
		{refund.payment_method_name}
		{refund.paid_day && refund.paid_day !== date ? (
			<Tag tone="amber">Paid {formatDayShort(refund.paid_day)}</Tag>
		) : null}
	</span>
);

export const RefundsSheetContent = ({
	date,
	refunds,
}: RefundsSheetContentProps) => {
	const isMobile = useIsMobile();

	return (
		<OrderList
			columns={COLUMNS}
			emptyText="No refunds this day."
			headings={["Time", "Customer", "Reason", "Paid with", "Refunded"]}
			isEmpty={refunds.length === 0}
		>
			{refunds.map((refund) => {
				const amount = <AmountCell amount={refund.amount} tone="refund" />;
				return (
					<OrderRow
						columns={COLUMNS}
						code={refund.order_code}
						key={`${refund.order_id}-${refund.refunded_at}`}
						orderId={refund.order_id}
					>
						{isMobile ? (
							<PhoneRowContent
								customerName={refund.customer_name}
								value={amount}
							>
								<span>{formatClock(refund.refunded_at)}</span>
								<span className="font-mono">{refund.order_code}</span>
								{refund.reasons.length > 0 ? (
									<span>{reasonsOf(refund)}</span>
								) : null}
								<PaidWith date={date} refund={refund} />
							</PhoneRowContent>
						) : (
							<>
								<TimeCell at={refund.refunded_at} />
								<OrderCustomer
									code={refund.order_code}
									customerName={refund.customer_name}
								/>
								<span>{reasonsOf(refund)}</span>
								<PaidWith date={date} refund={refund} />
								{amount}
							</>
						)}
					</OrderRow>
				);
			})}
		</OrderList>
	);
};

interface RefundsSectionProps {
	data: DayClose;
	onOpen: (list: string) => void;
}

export const RefundsSection = ({ data, onOpen }: RefundsSectionProps) => {
	const total = data.refunds.reduce((sum, refund) => sum + refund.amount, 0);

	return (
		<section className="grid gap-2.5">
			<h2 className="font-medium text-base">Refunds</h2>
			<div className="border border-border">
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
							<CountBadge count={data.refunds.length} />
						</span>
						<span className={AMOUNT_TONE.refund}>
							{"−"}
							{formatMoney(total)}
							<OpenArrow />
						</span>
					</button>
				)}
			</div>
		</section>
	);
};
