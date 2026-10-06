import { isInWorkshop } from "@fresclean/api/schema";
import type { OrderLine } from "@/features/orders/lib/order-lines";

export interface WorkshopRework {
	round: number;
	wentHome: boolean;
}

// The Rework round still in the workshop when the admin refunds the line it
// redoes, which the refund has to stop or keep (ADR-0013, 2026-10-06).
export const findWorkshopRework = (
	line: Pick<OrderLine, "complaints" | "status">,
): WorkshopRework | undefined => {
	const rounds = line.complaints?.[0]?.reworkLines ?? [];
	for (let index = rounds.length - 1; index >= 0; index -= 1) {
		if (isInWorkshop(rounds[index])) {
			return { round: index + 1, wentHome: line.status === "picked_up" };
		}
	}
	return undefined;
};

export const reworkChoiceCaption = (
	{ round, wentHome }: WorkshopRework,
	keep: boolean,
) => {
	if (keep) {
		return `Rework ${round} keeps going, free.`;
	}
	return wentHome
		? `Rework ${round} stops; the pair goes back as is.`
		: `Rework ${round} is cancelled.`;
};
