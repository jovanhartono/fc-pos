import type { ReactNode } from "react";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { useOpenNestedOrder } from "@/features/orders/hooks/useOpenNestedOrder";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface OrderRowProps {
	badges?: ReactNode;
	className?: string;
	code: string;
	customerName: string;
	details: (string | null | undefined)[];
	end: ReactNode;
	orderId: number;
}

export const OrderRow = ({
	badges,
	className,
	code,
	customerName,
	details,
	end,
	orderId,
}: OrderRowProps) => {
	const openOrder = useOpenNestedOrder();

	return (
		<li>
			<OrderListRow
				badges={badges}
				className={cn("-mx-2 px-2", className)}
				details={[code, ...details]}
				end={end}
				onClick={(event) => openOrder(event, orderId, code)}
				params={{ orderId: String(orderId) }}
				title={customerName}
				to="/orders/$orderId"
			/>
		</li>
	);
};

interface OrderListProps {
	children: ReactNode;
	emptyText: string;
	isEmpty: boolean;
}

export const OrderList = ({ children, emptyText, isEmpty }: OrderListProps) => {
	if (isEmpty) {
		return <p className="py-3 text-foreground text-body">{emptyText}</p>;
	}

	return <ul className="divide-y divide-border text-body">{children}</ul>;
};

export const AMOUNT_TONE = {
	paid: "font-medium text-tone-good-foreground",
	unpaid: "font-medium text-tone-bad-foreground",
	refund: "font-medium text-tone-bad-foreground",
	cancelled: "line-through",
};

export type AmountTone = keyof typeof AMOUNT_TONE;

interface AmountCellProps {
	amount: number;
	tone: AmountTone;
}

export const AmountCell = ({ amount, tone }: AmountCellProps) => (
	<span
		className={cn(
			"whitespace-nowrap text-right tabular-nums",
			AMOUNT_TONE[tone],
		)}
	>
		{tone === "refund" ? "−" : null}
		{formatMoney(amount)}
	</span>
);
