import type { ReactNode } from "react";
import { SectionTitle } from "@/components/section";

interface OrderSectionHeaderProps {
	children: ReactNode;
	action?: ReactNode;
}

export const OrderSectionHeader = ({
	children,
	action,
}: OrderSectionHeaderProps) => (
	<div className="flex min-h-7 items-center justify-between gap-3">
		<SectionTitle title={children} />
		{action}
	</div>
);
