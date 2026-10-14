import { Link } from "@tanstack/react-router";

interface OrderCodeLinkProps {
	code: string;
	orderId: number;
}

export const OrderCodeLink = ({ code, orderId }: OrderCodeLinkProps) => (
	<Link
		className="font-mono text-xs underline underline-offset-2"
		params={{ orderId: String(orderId) }}
		to="/orders/$orderId"
	>
		{code}
	</Link>
);
