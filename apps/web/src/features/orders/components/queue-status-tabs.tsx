import { Button } from "@/components/ui/button";
import type { OrderServiceQueueCounts } from "@/lib/api";
import {
	ACTIVE_ORDER_SERVICE_STATUSES,
	formatOrderServiceStatus,
} from "@/lib/status";

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
	<div className="-mx-1 overflow-x-auto pb-1">
		<div
			aria-label="Queue status"
			className="flex min-w-max gap-2 px-1"
			role="tablist"
		>
			{STATUS_TAB_ITEMS.map((status) => {
				const isActive = value === status.value;
				const count = counts?.[status.value];

				return (
					<Button
						aria-selected={isActive}
						className="h-11 gap-1.5 px-3 text-sm"
						key={status.value}
						onClick={() => onValueChange(status.value)}
						role="tab"
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
		</div>
	</div>
);
