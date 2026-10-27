import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { isListKeyBlocked } from "@/lib/list-keys";
import { useOrderWalkStore } from "@/stores/order-walk-store";

interface OrderWalkProps {
	openId: number;
	onSelect: (orderId: number) => void;
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

// Any dialog but the Order sheet itself, like a popover or a confirm over it.
const OTHER_DIALOGS = '[role="dialog"]:not([data-slot="sheet-content"])';

// A cashier going down the list steps from one Order to the next inside the
// sheet, without closing it and finding the next row.
export const OrderWalk = ({ openId, onSelect }: OrderWalkProps) => {
	const orders = useOrderWalkStore((s) => s.orders);
	const openIndex = orders.findIndex((order) => order.id === openId);
	const previous = orders[openIndex - 1];
	const next = openIndex >= 0 ? orders[openIndex + 1] : undefined;

	useEffect(() => {
		// Ahead of the table's own J and K, which would move its ring instead.
		const handleWalk = (event: KeyboardEvent) => {
			const step = WALK_KEYS[event.key];
			// Arrows inside tabs or a menu move within them, not to another Order.
			if (
				step === undefined ||
				isListKeyBlocked(event, OTHER_DIALOGS) ||
				(event.target instanceof Element &&
					event.target.closest(ARROW_KEY_WIDGETS))
			) {
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			// One Order per press: a held key would load every Order it passed.
			if (event.repeat || openIndex < 0) {
				return;
			}
			const target = orders[openIndex + step];
			if (target) {
				onSelect(target.id);
			}
		};
		window.addEventListener("keydown", handleWalk, true);
		return () => window.removeEventListener("keydown", handleWalk, true);
	}, [orders, openIndex, onSelect]);

	return (
		<div className="-my-1.5 -ml-2 flex items-center gap-1 text-muted-foreground text-footnote">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Previous Order"
				icon={<HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />}
				disabled={!previous}
				onClick={() => previous && onSelect(previous.id)}
			/>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Next Order"
				icon={<HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />}
				disabled={!next}
				onClick={() => next && onSelect(next.id)}
			/>
			<span className="ml-1 tabular-nums">
				{openIndex >= 0
					? `Order ${openIndex + 1} of ${orders.length}`
					: "Not on this page"}
			</span>
			<Button
				variant="ghost"
				size="sm"
				className="ml-auto"
				icon={<HugeiconsIcon icon={LinkSquare02Icon} />}
				render={
					<Link to="/orders/$orderId" params={{ orderId: String(openId) }} />
				}
				nativeButton={false}
			>
				Open Full Page
			</Button>
		</div>
	);
};
