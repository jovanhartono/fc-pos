import { WORKSHOP_SERVICE_STATUSES } from "@fresclean/api/schema";
import { StatusChipStrip } from "@/components/chip-strip";
import type { OrderServiceQueueCounts } from "@/features/orders/api";
import { formatOrderServiceStatus } from "@/lib/status";

const STATUS_TAB_ITEMS: {
	value: "all" | (typeof WORKSHOP_SERVICE_STATUSES)[number];
	label: string;
}[] = [
	{ value: "all", label: "All" },
	...WORKSHOP_SERVICE_STATUSES.map((status) => ({
		value: status,
		label: formatOrderServiceStatus(status),
	})),
];

interface QueueStatusTabsProps {
	value: string;
	counts?: OrderServiceQueueCounts;
	onValueChange: (value: string) => void;
}

export const QueueStatusTabs = ({
	value,
	counts,
	onValueChange,
}: QueueStatusTabsProps) => (
	<StatusChipStrip
		chips={STATUS_TAB_ITEMS.map((status) => ({
			...status,
			count: counts?.[status.value],
		}))}
		legend="Filter by status"
		onValueChange={onValueChange}
		value={value}
	/>
);
