import { Section } from "@/components/section";
import type { DayClose } from "@/features/counter/api";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import dayjs, { formatClock, JAKARTA_TZ } from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";

// A frame for the line, not the Stores' real hours, which nothing records: a
// pickup outside it stretches the line in 3-hour steps.
const OPEN_HOUR = 9;
const CLOSE_HOUR = 21;
const TICK_HOURS = 3;

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const minutesOf = (value: Date | number | string) => {
	const at = dayjs(value).tz(JAKARTA_TZ);
	return at.hour() * 60 + at.minute();
};

interface Pickup {
	id: number;
	isMany: boolean;
	minutes: number;
	time: string;
}

// The hour with the most pickups, the earlier one on a tie; a day with no two
// in one hour names its last pickup instead.
const busiestLine = (pickups: Pickup[]) => {
	const perHour = Array<number>(24).fill(0);
	for (const { minutes } of pickups) {
		perHour[Math.floor(minutes / 60)] += 1;
	}
	const busiestCount = Math.max(...perHour);
	if (busiestCount > 1) {
		const hour = perHour.indexOf(busiestCount);
		return `Busiest ${hourLabel(hour)}–${hourLabel(hour + 1)} · ${pluralize(busiestCount, "Order")}`;
	}
	return `Last pickup ${pickups.at(-1)?.time}`;
};

interface PickedUpSectionProps {
	data: DayClose;
	dayWord: string;
	isToday: boolean;
	onOpen: (list: string) => void;
}

// When the day's pickups happened, so the owner sees when the counter was busy.
// An empty day keeps the line, which fills dot by dot as Customers collect.
export const PickedUpSection = ({
	data,
	dayWord,
	isToday,
	onOpen,
}: PickedUpSectionProps) => {
	const now = useMinuteClock();
	const { picked_up: picked } = data;
	const pickups: Pickup[] = picked.order_list
		.map((order) => ({
			id: order.order_id,
			isMany: order.items > 1,
			minutes: minutesOf(order.picked_up_at),
			time: formatClock(order.picked_up_at),
		}))
		.sort((a, b) => a.minutes - b.minutes);
	const isEmpty = pickups.length === 0;

	const hours = pickups.map((pickup) => Math.floor(pickup.minutes / 60));
	const start =
		Math.floor(Math.min(OPEN_HOUR, ...hours) / TICK_HOURS) * TICK_HOURS;
	const end =
		Math.ceil(
			Math.max(CLOSE_HOUR, ...hours.map((hour) => hour + 1)) / TICK_HOURS,
		) * TICK_HOURS;
	const ticks = Array.from(
		{ length: (end - start) / TICK_HOURS + 1 },
		(_, index) => start + index * TICK_HOURS,
	);
	const position = (minutes: number) => {
		const share = (minutes - start * 60) / ((end - start) * 60);
		return `${Math.min(Math.max(share, 0), 1) * 100}%`;
	};

	return (
		<Section title="Picked Up">
			<div className="overflow-hidden rounded-lg border bg-card tabular-nums">
				<div
					className={cn(
						"flex items-baseline justify-between gap-3 px-3 pt-3",
						isEmpty && "text-muted-foreground",
					)}
				>
					<span className="font-medium text-title-2">
						{pluralize(picked.orders, "Order")}
					</span>
					<span>{pluralize(picked.items, "Item")}</span>
				</div>
				<div className="px-3 pt-2 pb-3">
					<div
						aria-label={
							isEmpty
								? `No pickups ${dayWord}`
								: `Picked up at ${pickups.map((pickup) => pickup.time).join(", ")}`
						}
						className="relative h-8"
						role="img"
					>
						<span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-soft-bar-track" />
						{isEmpty && isToday ? (
							<span
								className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40"
								style={{ left: position(minutesOf(now)) }}
							/>
						) : null}
						{pickups.map((pickup) => (
							<span
								className={cn(
									"absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary",
									pickup.isMany ? "size-4.5" : "size-3",
								)}
								key={pickup.id}
								style={{ left: position(pickup.minutes) }}
							/>
						))}
					</div>
					<div className="relative h-4 text-caption text-muted-foreground">
						{ticks.map((hour, index) => {
							// The first label starts at the line's left end and the last
							// ends at its right, so neither hangs past the card.
							const share = (index / (ticks.length - 1)) * 100;
							return (
								<span
									className="absolute top-0"
									key={hour}
									style={{
										left: `${share}%`,
										transform: `translateX(-${share}%)`,
									}}
								>
									{hourLabel(hour)}
								</span>
							);
						})}
					</div>
					{isEmpty ? null : <p className="pt-2">{busiestLine(pickups)}</p>}
				</div>
				{isEmpty ? (
					<p className="border-t px-3 py-2.5 text-muted-foreground">
						No Orders picked up {dayWord}.
					</p>
				) : (
					<button
						className="flex w-full items-baseline justify-between gap-3 border-t px-3 py-2.5 text-left hover:bg-muted"
						onClick={() => onOpen("picked-up")}
						type="button"
					>
						All Orders
						<OpenArrow />
					</button>
				)}
			</div>
		</Section>
	);
};
