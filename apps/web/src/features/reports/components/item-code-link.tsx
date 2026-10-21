import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface ItemCodeLinkProps {
	orderId: number;
	children: ReactNode;
}

export const ItemCodeLink = ({ orderId, children }: ItemCodeLinkProps) => (
	<Link
		to="/orders/$orderId"
		params={{ orderId: String(orderId) }}
		className="underline-offset-4 tabular-nums hover:underline"
	>
		{children}
	</Link>
);
