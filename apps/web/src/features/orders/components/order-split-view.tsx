import { ArrowSquareOutIcon, XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { type ReactNode, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Order } from "@/features/orders/api";
import { OrderDetailView } from "@/features/orders/components/order-detail-view";
import { isListKeyBlocked } from "@/lib/list-keys";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface OrderSplitViewProps {
	orders: Order[];
	openId: number;
	onSelect: (orderId: number) => void;
	onClose: () => void;
	footer?: ReactNode;
}

// A desktop cashier going down the list opens each Order beside it instead of
// leaving the page, so the list keeps its page, filters and scroll. J and K
// walk to the next Order and the pane follows; Esc closes the pane.
export const OrderSplitView = ({
	orders,
	openId,
	onSelect,
	onClose,
	footer,
}: OrderSplitViewProps) => {
	const listRef = useRef<HTMLUListElement>(null);
	const openIndex = orders.findIndex((order) => order.id === openId);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isListKeyBlocked(event)) {
				return;
			}
			if (event.key === "Escape") {
				onClose();
				return;
			}
			// One Order per press: a held key would load every Order it passed.
			if ((event.key !== "j" && event.key !== "k") || event.repeat) {
				return;
			}
			const next = orders[event.key === "j" ? openIndex + 1 : openIndex - 1];
			if (next) {
				event.preventDefault();
				onSelect(next.id);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [orders, openIndex, onSelect, onClose]);

	useEffect(() => {
		if (openIndex < 0) {
			return;
		}
		listRef.current?.children[openIndex]?.scrollIntoView({ block: "nearest" });
	}, [openIndex]);

	return (
		<div className="flex min-h-0 flex-1 border border-border bg-background">
			<div className="flex min-h-0 w-80 shrink-0 flex-col border-r xl:w-96">
				<ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
					{orders.map((order) => {
						const isOpen = order.id === openId;
						return (
							<li key={order.id}>
								<button
									type="button"
									aria-current={isOpen || undefined}
									onClick={() => onSelect(order.id)}
									className={cn(
										"grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 text-left text-sm transition-colors",
										isOpen
											? "bg-foreground text-background"
											: "hover:bg-muted/50",
									)}
								>
									<span className="truncate font-mono text-[13px]">
										{order.has_complaint ? (
											<span className="text-destructive">COMPLAINT </span>
										) : null}
										{order.code}
									</span>
									<span className="text-right font-semibold tabular-nums">
										{formatMoney(order.total)}
									</span>
									<span
										className={cn(
											"truncate text-xs tabular-nums",
											isOpen ? "text-background/70" : "text-muted-foreground",
										)}
									>
										{`${order.customer_name} · ${dayjs(order.created_at).format("DD/MM HH:mm")}`}
									</span>
									<span className="justify-self-end">
										<Badge variant={getOrderStatusBadgeVariant(order.status)}>
											{formatOrderStatus(order.status)}
										</Badge>
									</span>
								</button>
							</li>
						);
					})}
				</ul>
				{footer ? (
					<div className="shrink-0 border-t px-3 py-2">{footer}</div>
				) : null}
			</div>

			<section
				aria-label="Order"
				className="flex min-h-0 min-w-0 flex-1 flex-col"
			>
				<div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-1.5 text-muted-foreground text-xs">
					<span className="tabular-nums">
						{openIndex >= 0
							? `Order ${openIndex + 1} of ${orders.length} · J and K for the next one`
							: "Not on this page"}
					</span>
					<span className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="sm"
							icon={<ArrowSquareOutIcon className="size-4" />}
							render={
								<Link
									to="/orders/$orderId"
									params={{ orderId: String(openId) }}
								/>
							}
							nativeButton={false}
						>
							Open full page
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Close"
							icon={<XIcon className="size-4" />}
							onClick={onClose}
						/>
					</span>
				</div>
				{/* A plain block, not a grid: a grid squeezed the Order's cards. */}
				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					<OrderDetailView orderId={openId} />
				</div>
			</section>
		</div>
	);
};
