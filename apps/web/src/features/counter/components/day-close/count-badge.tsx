interface CountBadgeProps {
	count: number;
}

export const CountBadge = ({ count }: CountBadgeProps) => (
	<span className="ml-2 inline-block min-w-[22px] rounded-sm border border-border bg-muted px-1.5 text-center font-normal text-foreground text-footnote tabular-nums">
		{count}
	</span>
);
