import { Section } from "@/components/section";
import type { DayClose } from "@/features/counter/api";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { pluralize } from "@/shared/utils";

interface PickedUpSectionProps {
	data: DayClose;
	onOpen: (list: string) => void;
}

export const PickedUpSection = ({ data, onOpen }: PickedUpSectionProps) => {
	const { picked_up: picked } = data;
	return (
		<Section title="Picked Up">
			<div className="overflow-hidden rounded-lg border bg-card">
				{picked.orders === 0 ? (
					<p className="px-3 py-2.5">Nothing picked up this day.</p>
				) : (
					<button
						className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted"
						onClick={() => onOpen("picked-up")}
						type="button"
					>
						<span className="font-medium tabular-nums">
							{pluralize(picked.orders, "Order")} ·{" "}
							{pluralize(picked.items, "Item")}
						</span>
						<span className="whitespace-nowrap">
							All Orders
							<OpenArrow />
						</span>
					</button>
				)}
			</div>
		</Section>
	);
};
