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
		className="font-mono underline-offset-4 hover:underline"
	>
		{children}
	</Link>
);
