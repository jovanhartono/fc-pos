import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OrderReasonCalloutProps {
	label: string;
	reason?: string;
	note?: string | null;
	children?: ReactNode;
	className?: string;
}

export const OrderReasonCallout = ({
	label,
	reason,
	note,
	children,
	className,
}: OrderReasonCalloutProps) => (
	<div
		className={cn(
			"border border-destructive/40 bg-destructive/5 p-3",
			className,
		)}
	>
		<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
			{label}
		</p>
		{reason ? <p className="mt-1 text-sm font-medium">{reason}</p> : null}
		{note ? <p className="text-muted-foreground mt-1 text-sm">{note}</p> : null}
		{children}
	</div>
);
