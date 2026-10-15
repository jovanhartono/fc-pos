import { Link } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { OrderDetailView } from "@/features/orders/components/order-detail-view";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useSheet } from "@/stores/sheet-store";

interface OrderRowProps {
	children: ReactNode;
	className: string;
	code: string;
	orderId: number;
}

// A phone opens the Order's own page, whose back button returns to the
// Summary. A desktop opens it over the list, with a link back to that list.
export const OrderRow = ({
	children,
	className,
	code,
	orderId,
}: OrderRowProps) => {
	const isMobile = useIsMobile();
	const openNestedSheet = useSheet((s) => s.openNestedSheet);
	const closeSheet = useSheet((s) => s.closeSheet);
	const rowClass = cn(
		"grid w-full items-baseline gap-x-3 px-2 py-2.5 text-left hover:bg-muted",
		className,
	);

	const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
		if (isMobile) {
			closeSheet();
			return;
		}
		// A cmd- or middle-click still opens the Order in a new tab.
		if (
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.button !== 0
		) {
			return;
		}
		event.preventDefault();
		openNestedSheet({
			// The Order's own header already shows its code.
			title: <span className="sr-only">{code}</span>,
			backLabel: code,
			size: "wide",
			content: () => <OrderDetailView orderId={orderId} />,
		});
	};

	return (
		<li className="border-border border-b">
			<Link
				className={rowClass}
				onClick={handleOpen}
				params={{ orderId: String(orderId) }}
				to="/orders/$orderId"
			>
				{children}
			</Link>
		</li>
	);
};

interface OrderCodeProps {
	code: string;
}

export const OrderCode = ({ code }: OrderCodeProps) => (
	<span className="font-mono text-xs underline underline-offset-2">{code}</span>
);
