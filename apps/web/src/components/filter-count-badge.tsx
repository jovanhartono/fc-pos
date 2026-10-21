interface FilterCountBadgeProps {
	count: number;
}

// Sits on the corner of the round Filters button, so picking a filter never
// widens the button and pushes the search box or Scan beside it.
export const FilterCountBadge = ({ count }: FilterCountBadgeProps) => (
	<span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-medium text-caption text-primary-foreground tabular-nums">
		{count}
	</span>
);
