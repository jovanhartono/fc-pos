import type { DayClose } from "@/features/counter/api";
import { PaymentsSheetContent } from "@/features/counter/components/day-close/payments-sheet-content";
import {
	formatDayLong,
	groupBySlip,
	type MethodLine,
	splitMethodName,
} from "@/features/counter/lib/day-close";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

const ROW =
	"grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3.5 border-border border-t px-3 py-2 text-left tabular-nums first:border-t-0 hover:bg-muted";

interface MethodRowProps {
	amount: number;
	className?: string;
	label: string;
	onClick: () => void;
	payments: number;
}

const MethodRow = ({
	amount,
	className,
	label,
	onClick,
	payments,
}: MethodRowProps) => (
	<button className={cn(ROW, className)} onClick={onClick} type="button">
		<span>{label}</span>
		<span className="min-w-[4.5ch] text-right text-muted-foreground">
			{payments}
		</span>
		<span className="text-right">{formatMoney(amount)}</span>
	</button>
);

interface MethodsSectionProps {
	data: DayClose;
}

export const MethodsSection = ({ data }: MethodsSectionProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	const groups = groupBySlip(data.methods);

	const openPayments = (title: string, lines: MethodLine[]) => {
		const ids = new Set(lines.map((line) => line.payment_method_id));
		const payments = data.payments.filter((payment) =>
			ids.has(payment.payment_method_id),
		);
		const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
		openSheet({
			title,
			description: `${formatDayLong(data.date)} · ${pluralize(payments.length, "payment")} · ${formatMoney(total)}`,
			size: "wide",
			content: () => (
				<PaymentsSheetContent
					date={data.date}
					lineOf={
						lines.length > 1
							? (payment) => splitMethodName(payment.payment_method_name).line
							: null
					}
					payments={payments}
				/>
			),
		});
	};

	return (
		<section className="grid gap-2.5">
			<h2 className="font-medium text-[15px]">By PaymentMethod</h2>
			<div className="border border-border">
				{groups.length === 0 ? (
					<p className="px-3 py-2 text-muted-foreground">
						No payments this day.
					</p>
				) : null}
				{groups.map((group) => (
					<div
						className="border-border border-t first:border-t-0"
						key={group.slip}
					>
						<MethodRow
							amount={group.amount}
							className="border-t-0 font-medium"
							label={group.slip}
							onClick={() => openPayments(group.slip, group.lines)}
							payments={group.payments}
						/>
						{group.isSingle
							? null
							: group.lines.map((line) => (
									<MethodRow
										amount={line.amount}
										className="pl-7"
										key={line.payment_method_id ?? "none"}
										label={line.line}
										onClick={() => openPayments(line.name, [line])}
										payments={line.payments}
									/>
								))}
					</div>
				))}
				{groups.length > 0 ? (
					<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3.5 border-border border-t bg-muted/40 px-3 py-2 font-medium tabular-nums">
						<span>Total</span>
						<span className="min-w-[4.5ch] text-right font-normal text-muted-foreground">
							{data.collected.payments}
						</span>
						<span className="text-right">
							{formatMoney(data.collected.amount)}
						</span>
					</div>
				) : null}
			</div>
		</section>
	);
};
