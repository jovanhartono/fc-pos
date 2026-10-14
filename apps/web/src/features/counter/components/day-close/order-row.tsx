import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
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
	const openSheet = useSheet((s) => s.openSheet);
	const closeSheet = useSheet((s) => s.closeSheet);
	const rowClass = cn(
		"grid w-full items-baseline gap-x-3 px-2 py-2.5 text-left hover:bg-muted",
		className,
	);

	const handleOpen = () => {
		const list = useSheet.getState().sheetState;
		openSheet({
			// The Order's own header already shows its code.
			title: <span className="sr-only">{code}</span>,
			size: "wide",
			back: {
				label: String(list.title),
				onClick: () => useSheet.setState({ sheetState: list }),
			},
			content: () => <OrderDetailView orderId={orderId} />,
		});
	};

	return (
		<li className="border-border border-b">
			{isMobile ? (
				<Link
					className={rowClass}
					onClick={closeSheet}
					params={{ orderId: String(orderId) }}
					to="/orders/$orderId"
				>
					{children}
				</Link>
			) : (
				<button className={rowClass} onClick={handleOpen} type="button">
					{children}
				</button>
			)}
		</li>
	);
};

interface OrderCodeProps {
	code: string;
}

export const OrderCode = ({ code }: OrderCodeProps) => (
	<span className="font-mono text-xs underline underline-offset-2">{code}</span>
);
