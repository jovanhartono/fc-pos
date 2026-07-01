import type { ReactNode } from "react";

export const OrderSectionHeader = ({ children }: { children: ReactNode }) => (
	<div className="flex items-center justify-between px-4 py-2.5">
		<p className="text-foreground text-sm font-semibold">{children}</p>
	</div>
);
