import { Link } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { formatClock } from "@/features/counter/lib/day-close";
import { OrderDetailView } from "@/features/orders/components/order-detail-view";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";
import { useSheet } from "@/stores/sheet-store";

interface OrderRowProps {
	children: ReactNode;
	code: string;
	// The desktop grid; a phone always gets the two-line layout.
	columns: string;
	orderId: number;
}

// A phone opens the Order's own page, whose back button returns to the
// Summary. A desktop opens it over the list, with a link back to that list.
export const OrderRow = ({
	children,
	code,
	columns,
	orderId,
}: OrderRowProps) => {
	const isMobile = useIsMobile();
	const openNestedSheet = useSheet((s) => s.openNestedSheet);
	const closeSheet = useSheet((s) => s.closeSheet);
	const rowClass = cn(
		"grid w-full items-baseline gap-x-3 px-2 py-2.5 text-left hover:bg-muted",
		isMobile ? PHONE_ROW : columns,
	);

	const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
		if (isMobile) {
			closeSheet();
			return;
		}
		// A cmd- or middle-click still opens the Order in a new tab.
		if (
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.button !== 0
		) {
			return;
		}
		event.preventDefault();
		openNestedSheet({
			// The Order's own header already shows its code.
			title: <span className="sr-only">{code}</span>,
			backLabel: code,
			size: "wide",
			content: () => <OrderDetailView orderId={orderId} />,
		});
	};

	return (
		<li className="border-border border-b">
			<Link
				className={rowClass}
				onClick={handleOpen}
				params={{ orderId: String(orderId) }}
				to="/orders/$orderId"
			>
				{children}
			</Link>
		</li>
	);
};

interface OrderListProps {
	children: ReactNode;
	columns: string;
	emptyText: string;
	headings: string[];
	isEmpty: boolean;
}

// The sheet's own text is 12px; every list reads at 14px on desktop and phone.
export const OrderList = ({
	children,
	columns,
	emptyText,
	headings,
	isEmpty,
}: OrderListProps) => {
	const isMobile = useIsMobile();

	if (isEmpty) {
		return <p className="py-3 text-foreground text-sm">{emptyText}</p>;
	}

	return (
		<>
			{isMobile ? null : (
				<div
					className={cn(
						"grid gap-x-3 border-border border-b bg-muted px-2 py-2 font-medium text-foreground text-xs",
						columns,
					)}
				>
					{headings.map((heading, index) => (
						<span
							className={cn(index === headings.length - 1 && "text-right")}
							key={heading}
						>
							{heading}
						</span>
					))}
				</div>
			)}
			<ul className="text-sm">{children}</ul>
		</>
	);
};

const PHONE_ROW = "grid-cols-[minmax(0,1fr)_auto] gap-y-1";

interface PhoneRowContentProps {
	children: ReactNode;
	customerName: string;
	value: ReactNode;
}

// Line 2 takes one span per part; the "·" between them comes from CSS.
export const PhoneRowContent = ({
	children,
	customerName,
	value,
}: PhoneRowContentProps) => (
	<>
		<span className="font-medium">{customerName}</span>
		{value}
		<span className="col-span-full text-[13px] *:not-first:before:font-sans *:not-first:before:text-muted-foreground *:not-first:before:content-['_·_']">
			{children}
		</span>
	</>
);

interface OrderCustomerProps {
	children?: ReactNode;
	code: string;
	customerName: string;
}

export const OrderCustomer = ({
	children,
	code,
	customerName,
}: OrderCustomerProps) => (
	<span className="min-w-0">
		<span className="block font-medium">{customerName}</span>
		<span className="flex flex-wrap items-baseline">
			<span className="font-mono text-xs underline underline-offset-2">
				{code}
			</span>
			{children}
		</span>
	</span>
);

interface TimeCellProps {
	at: string;
}

export const TimeCell = ({ at }: TimeCellProps) => (
	<span className="tabular-nums">{formatClock(at)}</span>
);

export const AMOUNT_TONE = {
	paid: "font-medium text-emerald-700 dark:text-emerald-300",
	unpaid: "font-medium text-rose-700 dark:text-rose-300",
	refund: "font-medium text-rose-700 dark:text-rose-300",
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

const TAG_TONE = {
	green:
		"bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
	amber: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
};

interface TagProps {
	children: ReactNode;
	tone: keyof typeof TAG_TONE;
}

export const Tag = ({ children, tone }: TagProps) => (
	<span
		className={cn(
			"ml-1.5 inline-flex h-5 items-center whitespace-nowrap px-1.5 font-medium text-xs",
			TAG_TONE[tone],
		)}
	>
		{children}
	</span>
);
