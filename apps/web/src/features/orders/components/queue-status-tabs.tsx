import { Button } from "@/components/ui/button";
import {
	ACTIVE_ORDER_SERVICE_STATUSES,
	formatOrderServiceStatus,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const STATUS_TAB_ITEMS = [
	{ value: "all", label: "All active statuses" },
	...ACTIVE_ORDER_SERVICE_STATUSES.map((status) => ({
		value: status,
		label: formatOrderServiceStatus(status),
	})),
];

interface QueueStatusTabsProps {
	value: string;
	onValueChange: (value: string) => void;
	className?: string;
}

export const QueueStatusTabs = ({
	value,
	onValueChange,
	className,
}: QueueStatusTabsProps) => (
	<div className={cn("grid gap-2", className)}>
		<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
			Status
		</p>
		<div className="-mx-1 overflow-x-auto pb-1">
			<div
				role="tablist"
				aria-label="Queue status"
				className="flex min-w-max gap-2 px-1"
			>
				{STATUS_TAB_ITEMS.map((status) => {
					const isActive = value === status.value;

					return (
						<Button
							key={status.value}
							type="button"
							variant={isActive ? "default" : "outline"}
							size="lg"
							role="tab"
							aria-selected={isActive}
							className={cn(
								"h-11 px-4 text-sm",
								isActive
									? "border-primary bg-primary text-primary-foreground shadow-sm"
									: "border-border/80 bg-background text-foreground/70 hover:border-foreground/20 hover:bg-muted/70 hover:text-foreground",
							)}
							onClick={() => onValueChange(status.value)}
						>
							{status.label}
						</Button>
					);
				})}
			</div>
		</div>
	</div>
);
