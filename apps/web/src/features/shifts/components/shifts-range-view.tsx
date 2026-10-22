import { Section } from "@/components/section";
import {
	DayMarkCell,
	type MarkSize,
	ShiftsLegend,
} from "@/features/shifts/components/shift-marks";
import {
	ForgottenNote,
	SummaryLine,
	SummaryValue,
} from "@/features/shifts/components/shifts-summary";
import {
	formatHours,
	type PersonRow,
	type StoreGroup,
	summarizeGroups,
} from "@/features/shifts/lib/shifts-overview";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";

interface ShiftsRangeViewProps {
	groups: StoreGroup[];
	days: string[];
	today: string;
	isPhone: boolean;
	onOpen: (row: PersonRow, group: StoreGroup) => void;
}

// Up to two weeks a day gets a big square, up to a month a small one, and past
// that a thin bar, so a row still fits on one line.
const layoutFor = (dayCount: number): { size: MarkSize; nameWidth: string } => {
	if (dayCount <= 14) {
		return { size: "big", nameWidth: "24%" };
	}
	if (dayCount <= 31) {
		return { size: "small", nameWidth: "18%" };
	}
	return { size: "bar", nameWidth: "22%" };
};

export const ShiftsRangeView = ({
	groups,
	days,
	today,
	isPhone,
	onOpen,
}: ShiftsRangeViewProps) => {
	const totals = summarizeGroups(groups);
	return (
		<div className="grid gap-4">
			<SummaryLine>
				<SummaryValue
					value={totals.days.toLocaleString("en-ID")}
					label="days"
				/>
				<SummaryValue value={totals.people} label="people" />
				<SummaryValue value={formatHours(totals.minutes)} label="worked" />
				<ForgottenNote count={totals.forgotten} />
			</SummaryLine>
			<ShiftsLegend />
			<div className="grid gap-5">
				{groups.map((group) => (
					<Section
						key={group.store.id}
						title={group.store.name}
						count={pluralize(group.days, "day")}
					>
						<div className="overflow-hidden rounded-lg border bg-card">
							{group.rows.length === 0 ? (
								<p className="px-3 py-2.5 text-body">No one on this Store.</p>
							) : isPhone ? (
								group.rows.map((row) => (
									<PersonCard
										key={row.person.id}
										row={row}
										days={days}
										today={today}
										onOpen={() => onOpen(row, group)}
									/>
								))
							) : (
								<PersonGrid
									group={group}
									days={days}
									today={today}
									onOpen={onOpen}
								/>
							)}
						</div>
					</Section>
				))}
			</div>
		</div>
	);
};

interface PersonNameProps {
	row: PersonRow;
}

const PersonName = ({ row }: PersonNameProps) => (
	<span className="min-w-0">
		<span className="font-medium text-body">{row.person.name}</span>
		<span className="ml-1.5 text-muted-foreground text-subhead">
			{row.person.role}
		</span>
		{row.elsewhere.map((other) => (
			<span key={other.storeId} className="block text-footnote text-link">
				+ {pluralize(other.days, "day")} at {other.storeName}
			</span>
		))}
	</span>
);

interface PersonGridProps {
	group: StoreGroup;
	days: string[];
	today: string;
	onOpen: (row: PersonRow, group: StoreGroup) => void;
}

const tickIndexes = (count: number) => [
	0,
	Math.floor(count / 3),
	Math.floor((count * 2) / 3),
	count - 1,
];

const PersonGrid = ({ group, days, today, onOpen }: PersonGridProps) => {
	const { size, nameWidth } = layoutFor(days.length);
	const isBars = size === "bar";
	// Every column but the name is fixed, so the squares line up under their
	// dates whatever the names say.
	const columns = isBars
		? `${nameWidth} minmax(0,1fr) 4.5rem 4.5rem`
		: `${nameWidth} repeat(${days.length}, minmax(0,1fr)) 4.5rem 4.5rem`;

	return (
		<div>
			<div
				className="grid items-center border-b py-2 pl-3 font-medium text-caption text-muted-foreground"
				style={{ gridTemplateColumns: columns }}
			>
				<span>Worker</span>
				{isBars ? (
					<span className="mr-3 flex justify-between">
						{tickIndexes(days.length).map((index) => (
							<span key={index}>{dayjs(days[index]).format("D MMM")}</span>
						))}
					</span>
				) : (
					days.map((day) => (
						<span key={day} className="text-center whitespace-nowrap">
							{size === "big"
								? dayjs(day).format("ddd D")
								: dayjs(day).format("D")}
						</span>
					))
				)}
				<span className="pr-3 text-right">Days</span>
				<span className="pr-3 text-right">Hours</span>
			</div>
			{group.rows.map((row) => (
				<button
					type="button"
					key={row.person.id}
					onClick={() => onOpen(row, group)}
					className="grid w-full items-center py-2.5 pl-3 text-left hover:bg-muted not-first:border-t"
					style={{ gridTemplateColumns: columns }}
				>
					<PersonName row={row} />
					{isBars ? (
						<span className="mr-3 flex gap-px">
							{days.map((day) => (
								<DayMarkCell
									key={day}
									mark={row.marks.get(day)}
									isFuture={day > today}
									size="bar"
								/>
							))}
						</span>
					) : (
						days.map((day) => (
							<span key={day} className="flex justify-center">
								<DayMarkCell
									mark={row.marks.get(day)}
									isFuture={day > today}
									size={size}
								/>
							</span>
						))
					)}
					<span className="pr-3 text-right font-medium text-title-3 tabular-nums">
						{row.days}
					</span>
					<span className="pr-3 text-right text-body tabular-nums">
						{formatHours(row.minutes)}
					</span>
				</button>
			))}
		</div>
	);
};

interface PersonCardProps {
	row: PersonRow;
	days: string[];
	today: string;
	onOpen: () => void;
}

const PersonCard = ({ row, days, today, onOpen }: PersonCardProps) => (
	<button
		type="button"
		onClick={onOpen}
		className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-muted not-first:border-t"
	>
		<PersonName row={row} />
		<span className="font-medium text-title-3 tabular-nums">
			{row.days}{" "}
			<span className="font-normal text-muted-foreground text-subhead">
				{row.days === 1 ? "day" : "days"}
			</span>
		</span>
		<span
			className={cn(
				"col-span-full mt-1 flex",
				days.length > 31 ? "gap-px" : "gap-0.5",
			)}
		>
			{days.map((day) => (
				<DayMarkCell
					key={day}
					mark={row.marks.get(day)}
					isFuture={day > today}
					size="strip"
				/>
			))}
		</span>
		<span className="col-span-full text-footnote tabular-nums">
			{formatHours(row.minutes)}
		</span>
	</button>
);
