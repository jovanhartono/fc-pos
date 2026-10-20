import { StatusChipStrip } from "@/components/chip-strip";
import type { OrderStatusCounts } from "@/features/orders/api";
import { ORDER_STATUS_VALUES } from "@/features/orders/components/order-filters";
import { formatOrderStatus } from "@/lib/status";

type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

interface OrderStatusTabsProps {
	value?: OrderStatus;
	counts?: OrderStatusCounts;
	onValueChange: (value?: OrderStatus) => void;
}

const ALL = "all";

const TABS: { value: OrderStatus | typeof ALL; label: string }[] = [
	{ value: ALL, label: "All" },
	...ORDER_STATUS_VALUES.map((status) => ({
		value: status,
		label: formatOrderStatus(status),
	})),
];

// The cashier sees how many Orders wait in each stage and picks one in a tap.
export const OrderStatusTabs = ({
	value,
	counts,
	onValueChange,
}: OrderStatusTabsProps) => {
	const total = counts
		? Object.values(counts).reduce((sum, count) => sum + count, 0)
		: undefined;

	return (
		<StatusChipStrip
			chips={TABS.map((tab) => ({
				...tab,
				count: tab.value === ALL ? total : counts?.[tab.value],
			}))}
			legend="Filter by status"
			onValueChange={(next) => onValueChange(next === ALL ? undefined : next)}
			value={value ?? ALL}
		/>
	);
};
