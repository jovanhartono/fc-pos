import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";

export interface PageHeaderProps {
	title: string;
	// How many records the list below holds, in a badge after the title: "4 stores".
	count?: number;
	// What the count is of, singular ("store"). A page that names it keeps the
	// badge's place while the count loads.
	countNoun?: string;
	// Only for a noun that doesn't just take an "s": "categories".
	countNounPlural?: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

export function PageHeader({
	title,
	count,
	countNoun,
	countNounPlural,
	description,
	actions,
	className,
}: PageHeaderProps) {
	return (
		// On a phone the actions share the title's row and the description takes
		// the full width under both, instead of wrapping into a narrow column.
		<div
			className={cn(
				"mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1",
				className,
			)}
		>
			{/* A phone too narrow for the title, badge and actions puts the badge
			    under the title, lined up with it. */}
			<h1 className="col-start-1 row-start-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-title-1 font-bold tracking-tight">
				{title}
				{/* Drawn hidden until the count loads, so the title line never changes when it lands. */}
				{countNoun ? (
					<Badge
						className={cn(
							"tracking-normal tabular-nums",
							count === undefined && "invisible",
						)}
						variant="outline"
					>
						{pluralize(count ?? 0, countNoun, countNounPlural)}
					</Badge>
				) : null}
			</h1>
			{description ? (
				<p className="col-span-2 row-start-2 text-body text-muted-foreground sm:col-span-1">
					{description}
				</p>
			) : null}
			{actions ? (
				<div
					className={cn(
						"col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-2",
						description && "sm:row-span-2",
					)}
				>
					{actions}
				</div>
			) : null}
		</div>
	);
}
