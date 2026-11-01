import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ItemCodeLinkProps {
	orderId: number;
	children: ReactNode;
	// Blue where the row itself doesn't open the Order.
	className?: string;
}

export const ItemCodeLink = ({
	orderId,
	children,
	className,
}: ItemCodeLinkProps) => (
	<Link
		to="/orders/$orderId"
		params={{ orderId: String(orderId) }}
		className={cn("underline-offset-4 tabular-nums hover:underline", className)}
	>
		{children}
	</Link>
);
