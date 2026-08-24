import type { ReactNode } from "react";

interface OrderSectionHeaderProps {
	children: ReactNode;
	action?: ReactNode;
}

export const OrderSectionHeader = ({
	children,
	action,
}: OrderSectionHeaderProps) => (
	<div className="flex items-center justify-between px-4 py-2.5">
		<p className="text-foreground text-sm font-semibold">{children}</p>
		{action}
	</div>
);
