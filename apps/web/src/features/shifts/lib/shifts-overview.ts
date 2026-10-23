import type {
	ShiftDay,
	ShiftPerson,
	ShiftsOverview,
} from "@/features/shifts/api";
import dayjs from "@/lib/dayjs";
import {
	type DatePreset,
	jakartaToday,
	WIRE_FORMAT,
} from "@/shared/date-presets";

export interface ShiftsRange {
	from: string;
	to: string;
}

export interface ShiftStore {
	id: number;
	name: string;
	is_active: boolean;
}

export const listDays = ({ from, to }: ShiftsRange) => {
	const days: string[] = [];
	for (
		let day = dayjs(from);
		!day.isAfter(dayjs(to), "day");
		day = day.add(1, "day")
	) {
		days.push(day.format(WIRE_FORMAT));
	}
	return days;
};

const isMonthShape = ({ from, to }: ShiftsRange, today: string) => {
	const start = dayjs(from);
	return (
		start.date() === 1 &&
		start.isSame(to, "month") &&
		(to === start.endOf("month").format(WIRE_FORMAT) || to === today)
	);
};

const isWeekShape = ({ from, to }: ShiftsRange, today: string) => {
	const start = dayjs(from);
	const sunday = start.add(6, "day").format(WIRE_FORMAT);
	return start.day() === 1 && to <= sunday && (to === sunday || to === today);
};

const stepKind = (
	range: ShiftsRange,
	today: string,
	preset: DatePreset | undefined,
) => {
	if (preset === "thisMonth" || preset === "lastMonth") {
		return "month";
	}
	if (preset === "thisWeek" || preset === "lastWeek") {
		return "week";
	}
	if (preset || range.from === range.to) {
		return "length";
	}
	// A stepped range has no preset, but it is a whole Mon–Sun week or month.
	if (isWeekShape(range, today)) {
		return "week";
	}
	return isMonthShape(range, today) ? "month" : "length";
};

// ‹ › move by what is showing: a calendar month for This/Last month, a Monday
// week for This/Last week, otherwise the range's own length. Never past today.
export const stepRange = (
	range: ShiftsRange,
	direction: -1 | 1,
	today: string,
	preset?: DatePreset,
): ShiftsRange => {
	const clamp = (next: ShiftsRange): ShiftsRange =>
		next.to > today ? { from: next.from, to: today } : next;
	const kind = stepKind(range, today, preset);

	if (kind === "month") {
		const start = dayjs(range.from).add(direction, "month");
		return clamp({
			from: start.format(WIRE_FORMAT),
			to: start.endOf("month").format(WIRE_FORMAT),
		});
	}
	if (kind === "week") {
		const start = dayjs(range.from).add(direction * 7, "day");
		return clamp({
			from: start.format(WIRE_FORMAT),
			to: start.add(6, "day").format(WIRE_FORMAT),
		});
	}
	const length = listDays(range).length;
	const to = dayjs(range.to).add(direction * length, "day");
	// Stepping forward into today keeps the length, so Last 30 days stays 30.
	const end = to.format(WIRE_FORMAT) > today ? dayjs(today) : to;
	return {
		from: end.subtract(length - 1, "day").format(WIRE_FORMAT),
		to: end.format(WIRE_FORMAT),
	};
};

export interface DayMark {
	shifts: number;
	minutes: number;
	forgotten: number;
	isOpen: boolean;
	firstIn: string;
	lastOut: string | null;
}

export interface ElsewhereDays {
	storeId: number;
	storeName: string;
	days: number;
}

export interface PersonRow {
	person: ShiftPerson;
	marks: Map<string, DayMark>;
	days: number;
	minutes: number;
	forgotten: number;
	isOpen: boolean;
	elsewhere: ElsewhereDays[];
	elsewhereByDay: Map<string, string>;
	// What the meal fee is paid on: one per day, whichever Store.
	daysAllStores: number;
}

export interface StoreGroup {
	store: ShiftStore;
	rows: PersonRow[];
}

const toMark = (day: ShiftDay): DayMark => ({
	shifts: day.shifts,
	minutes: day.minutes,
	forgotten: day.forgotten,
	isOpen: day.open,
	firstIn: day.first_in,
	lastOut: day.last_out,
});

export const buildRow = (
	person: ShiftPerson,
	storeId: number,
	personDays: ShiftDay[],
	stores: ShiftStore[],
): PersonRow => {
	const here = personDays.filter((day) => day.store_id === storeId);
	const elsewhere = stores
		.filter((store) => store.id !== storeId)
		.map((store) => ({
			storeId: store.id,
			storeName: store.name,
			days: new Set(
				personDays
					.filter((day) => day.store_id === store.id)
					.map((day) => day.day),
			).size,
		}))
		.filter((other) => other.days > 0);
	const elsewhereByDay = new Map<string, string>();
	for (const day of personDays) {
		const store = stores.find((other) => other.id === day.store_id);
		if (day.store_id !== storeId && store && !elsewhereByDay.has(day.day)) {
			elsewhereByDay.set(day.day, store.name);
		}
	}
	return {
		person,
		marks: new Map(here.map((day) => [day.day, toMark(day)])),
		days: here.length,
		minutes: here.reduce((sum, day) => sum + day.minutes, 0),
		forgotten: here.reduce((sum, day) => sum + day.forgotten, 0),
		isOpen: here.some((day) => day.open),
		elsewhere,
		elsewhereByDay,
		daysAllStores: new Set(personDays.map((day) => day.day)).size,
	};
};

// A person who works at two Stores is listed under each, with their days at
// the other one beside their name.
export const buildStoreGroups = (
	overview: ShiftsOverview,
	stores: ShiftStore[],
	storeId: number | undefined,
): StoreGroup[] => {
	const daysByPerson = new Map<number, ShiftDay[]>();
	for (const day of overview.days) {
		const personDays = daysByPerson.get(day.user_id);
		if (personDays) {
			personDays.push(day);
		} else {
			daysByPerson.set(day.user_id, [day]);
		}
	}
	const shown = stores.filter((store) =>
		storeId === undefined
			? store.is_active ||
				overview.days.some((day) => day.store_id === store.id)
			: store.id === storeId,
	);
	const groups = shown.map((store) => {
		const rows = overview.people
			.filter((person) =>
				daysByPerson.get(person.id)?.some((day) => day.store_id === store.id),
			)
			.map((person) =>
				buildRow(person, store.id, daysByPerson.get(person.id) ?? [], stores),
			);
		return { store, rows };
	});
	// Stores where someone worked come first; the empty ones sink to the end.
	return groups.sort(
		(a, b) => Number(b.rows.length > 0) - Number(a.rows.length > 0),
	);
};

// An admin opening today's Shifts looks for who is in, so those still on shift
// lead, then who has left; names stay A–Z within each.
export const sortByStatus = (rows: PersonRow[]) =>
	[...rows].sort((a, b) => Number(b.isOpen) - Number(a.isOpen));

// "Last 30 days · 23 Sep – 22 Oct", or just the dates for a picked range; the
// year shows once the range reaches outside this one.
export const rangeLabel = (range: ShiftsRange, presetLabel?: string) => {
	const start = dayjs(range.from);
	const end = dayjs(range.to);
	const thisYear = Number(jakartaToday().slice(0, 4));
	const year =
		start.year() === thisYear && end.year() === thisYear ? "" : " YYYY";
	const dates =
		range.from === range.to
			? start.format(`ddd D MMM${year}`)
			: `${start.format(`D MMM${year}`)} – ${end.format(`D MMM${year}`)}`;
	return presetLabel ? `${presetLabel} · ${dates}` : dates;
};

export const formatHours = (minutes: number) =>
	`${Math.round(minutes / 60).toLocaleString("en-ID")}h`;
