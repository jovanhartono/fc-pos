import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface ListPanelProps {
	children: ReactNode;
}

// Below lg every row is already its own bordered card, so a box around the
// list only takes width away from them on a phone.
export const ListPanel = ({ children }: ListPanelProps) => (
	<Card className="max-lg:bg-transparent max-lg:py-0 max-lg:ring-0">
		<CardContent className="max-lg:px-0">{children}</CardContent>
	</Card>
);
