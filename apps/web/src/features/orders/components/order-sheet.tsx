import {
	ArrowSquareOutIcon,
	CaretLeftIcon,
	CaretRightIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { KeyHint } from "@/components/key-hint";
import { Button } from "@/components/ui/button";
import type { Order } from "@/features/orders/api";
import { OrderDetailView } from "@/features/orders/components/order-detail-view";
import { isListKeyBlocked } from "@/lib/list-keys";

interface OrderSheetProps {
	orders: Order[];
	openId: number;
	onSelect: (orderId: number) => void;
	onClose: () => void;
}

// J and K stay, the same keys that walk the table's rows.
const WALK_KEYS: Record<string, number> = {
	ArrowRight: 1,
	j: 1,
	ArrowLeft: -1,
	k: -1,
};

const ARROW_KEY_WIDGETS =
	'[role="tablist"], [role="menu"], [role="listbox"], [role="radiogroup"], [role="slider"]';

// A cashier going down the list opens each Order over the right of the table
// instead of leaving the page, so the list keeps its page, filters and scroll,
// and the Order code column stays in reach to open the next one.
export const OrderSheet = ({
	orders,
	openId,
	onSelect,
	onClose,
}: OrderSheetProps) => {
	const openIndex = orders.findIndex((order) => order.id === openId);
	const previous = orders[openIndex - 1];
	const next = orders[openIndex + 1];

	useEffect(() => {
		// Ahead of the table's own J and K, which would move its ring instead.
		const handleWalk = (event: KeyboardEvent) => {
			const step = WALK_KEYS[event.key];
			// Arrows inside tabs or a menu move within them, not to another Order.
			if (
				step === undefined ||
				isListKeyBlocked(event) ||
				(event.target instanceof Element &&
					event.target.closest(ARROW_KEY_WIDGETS))
			) {
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			// One Order per press: a held key would load every Order it passed.
			if (event.repeat) {
				return;
			}
			const target = orders[openIndex + step];
			if (target) {
				onSelect(target.id);
			}
		};
		// After any open menu, which closes on Esc first.
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !isListKeyBlocked(event)) {
				onClose();
			}
		};
		window.addEventListener("keydown", handleWalk, true);
		window.addEventListener("keydown", handleEscape);
		return () => {
			window.removeEventListener("keydown", handleWalk, true);
			window.removeEventListener("keydown", handleEscape);
		};
	}, [orders, openIndex, onSelect, onClose]);

	return (
		// At least 36rem wide for the Order, and 11rem of the list left beside it
		// when the window has room for both; a narrow tablet covers the list.
		<aside
			aria-label="Order"
			className="absolute inset-y-0 right-0 z-20 flex w-[min(60rem,max(60%,min(100%,40rem)),max(calc(100%_-_11rem),min(100%,36rem)))] animate-in flex-col border-l bg-background shadow-lg duration-200 fade-in slide-in-from-right-8"
		>
			<div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5 text-muted-foreground text-xs">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Previous Order"
					icon={<CaretLeftIcon className="size-4" />}
					disabled={!previous}
					onClick={() => previous && onSelect(previous.id)}
				/>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Next Order"
					icon={<CaretRightIcon className="size-4" />}
					disabled={!next}
					onClick={() => next && onSelect(next.id)}
				/>
				<span className="ml-1 tabular-nums">
					{openIndex >= 0
						? `Order ${openIndex + 1} of ${orders.length}`
						: "Not on this page"}
				</span>
				<KeyHint
					keys={["←", "→"]}
					className="ml-2 hidden items-center gap-1.5 lg:inline-flex"
				/>
				<span className="ml-auto flex items-center gap-1">
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
		</aside>
	);
};
