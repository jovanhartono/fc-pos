import { WORKSHOP_SERVICE_STATUSES } from "@fresclean/api/schema";
import { StatusChipStrip } from "@/components/chip-strip";
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
	onValueChange: (value: string) => void;
}

export const QueueStatusTabs = ({
	value,
	onValueChange,
}: QueueStatusTabsProps) => (
	<StatusChipStrip
		chips={STATUS_TAB_ITEMS}
		legend="Filter by status"
		onValueChange={onValueChange}
		value={value}
	/>
);
