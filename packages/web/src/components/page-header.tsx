import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
	title: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

export function PageHeader({
	title,
	description,
	actions,
	className,
}: PageHeaderProps) {
	return (
		<div
			className={cn(
				"mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
				className,
			)}
		>
			<div className="grid gap-1">
				<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
				{description ? (
					<p className="text-sm text-muted-foreground">{description}</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex flex-wrap items-center gap-2 sm:shrink-0">
					{actions}
				</div>
			) : null}
		</div>
	);
}
