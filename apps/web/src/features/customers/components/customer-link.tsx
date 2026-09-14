import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";

interface CustomerLinkProps {
	className?: string;
	customerId: number;
	name: string;
}

// The detail page is admin-only (ADR-0021); a cashier gets the name as text
// rather than a link into a page that would refuse them.
export const CustomerLink = ({
	className,
	customerId,
	name,
}: CustomerLinkProps) => {
	if (getCurrentUser()?.role !== "admin") {
		return <span className={cn("font-medium", className)}>{name}</span>;
	}

	return (
		<Link
			className={cn("font-medium", className)}
			params={{ customerId: String(customerId) }}
			// The name sits in every order row, so a cursor sweeping the column
			// would otherwise preload a detail page and its orders per row.
			preloadDelay={300}
			search={{ page: 1 }}
			to="/customers/$customerId"
		>
			{name}
		</Link>
	);
};
