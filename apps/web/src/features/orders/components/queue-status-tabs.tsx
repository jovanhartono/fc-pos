import { CHIP_STRIP_ROW, ChipStripScroller } from "@/components/chip-strip";
import { Button } from "@/components/ui/button";
import type { OrderServiceQueueCounts } from "@/lib/api";
import {
	ACTIVE_ORDER_SERVICE_STATUSES,
	formatOrderServiceStatus,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const STATUS_TAB_ITEMS: {
	value: "all" | (typeof ACTIVE_ORDER_SERVICE_STATUSES)[number];
	label: string;
}[] = [
	{ value: "all", label: "All" },
	...ACTIVE_ORDER_SERVICE_STATUSES.map((status) => ({
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
	<ChipStripScroller>
		{/* Toggle buttons, not tabs: tablist semantics promise arrow-key roving
		    and tabpanels these filter chips don't have. Matches the catalog's
		    category strip. */}
		<fieldset className={cn(CHIP_STRIP_ROW, "border-0 p-0")}>
			<legend className="sr-only">Filter by status</legend>
			{STATUS_TAB_ITEMS.map((status) => {
				const isActive = value === status.value;
				const count = counts?.[status.value];

				return (
					<Button
						aria-pressed={isActive}
						className="h-11 gap-1.5 px-3 text-sm"
						key={status.value}
						onClick={() => onValueChange(status.value)}
						type="button"
						variant={isActive ? "default" : "outline"}
					>
						{status.label}
						{count === undefined ? null : (
							<span className="font-mono font-semibold tabular-nums">
								{count}
							</span>
						)}
					</Button>
				);
			})}
		</fieldset>
	</ChipStripScroller>
);
