import type { ReactNode } from "react";

interface OrderSectionHeaderProps {
	children: ReactNode;
	action?: ReactNode;
}

// The title above a section's card, the same for Items, Products, Payment and
// Attachments.
export const OrderSectionHeader = ({
	children,
	action,
}: OrderSectionHeaderProps) => (
	<div className="flex min-h-7 items-center justify-between gap-3">
		<h2 className="font-medium text-body text-foreground compact:text-subhead">
			{children}
		</h2>
		{action}
	</div>
);
