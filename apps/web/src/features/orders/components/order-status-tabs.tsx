import { STRIP_FADE, TAB_STRIP_ROW } from "@/components/chip-strip";
import type { OrderStatusCounts } from "@/features/orders/api";
import { ORDER_STATUS_VALUES } from "@/features/orders/components/order-filters";
import { formatOrderStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

interface OrderStatusTabsProps {
	value?: OrderStatus;
	counts?: OrderStatusCounts;
	onValueChange: (value?: OrderStatus) => void;
}

const TABS: { value?: OrderStatus; label: string }[] = [
	{ value: undefined, label: "All" },
	...ORDER_STATUS_VALUES.map((status) => ({
		value: status,
		label: formatOrderStatus(status),
	})),
];

// The cashier sees how many Orders wait in each stage and picks one in a tap.
// Toggle buttons, not a tablist: there are no tab panels behind them.
export const OrderStatusTabs = ({
	value,
	counts,
	onValueChange,
}: OrderStatusTabsProps) => {
	const total = counts
		? Object.values(counts).reduce((sum, count) => sum + count, 0)
		: undefined;

	return (
		<fieldset className={cn("min-w-0 border-0 p-0", STRIP_FADE)}>
			<legend className="sr-only">Filter by status</legend>
			<div className={TAB_STRIP_ROW}>
				{TABS.map((tab) => {
					const isActive = value === tab.value;
					const count = tab.value ? counts?.[tab.value] : total;
					return (
						<button
							type="button"
							key={tab.label}
							aria-pressed={isActive}
							onClick={() => onValueChange(tab.value)}
							className={cn(
								"flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors first:pl-0",
								isActive
									? "border-foreground font-semibold text-foreground"
									: "border-transparent font-medium text-muted-foreground hover:text-foreground",
							)}
						>
							{tab.label}
							{count === undefined ? null : (
								<span
									className={cn(
										"text-xs tabular-nums",
										isActive ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{count}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</fieldset>
	);
};
