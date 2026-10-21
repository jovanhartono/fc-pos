import { StatusChipStrip } from "@/components/chip-strip";
import { ORDER_STATUS_VALUES } from "@/features/orders/components/order-filters";
import { formatOrderStatus } from "@/lib/status";

type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

interface OrderStatusTabsProps {
	value?: OrderStatus;
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

// The cashier picks a stage in a tap; how many it holds reads in the title.
export const OrderStatusTabs = ({
	value,
	onValueChange,
}: OrderStatusTabsProps) => (
	<StatusChipStrip
		chips={TABS}
		legend="Filter by status"
		onValueChange={(next) => onValueChange(next === ALL ? undefined : next)}
		value={value ?? ALL}
	/>
);
