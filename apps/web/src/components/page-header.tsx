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
			className={cn("mb-6 flex items-center justify-between gap-4", className)}
		>
			<div className="grid min-w-0 gap-1">
				<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
				{description ? (
					<p className="text-sm text-muted-foreground">{description}</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}
