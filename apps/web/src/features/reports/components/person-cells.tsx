import type { ReactNode } from "react";
import {
	numberFormatter,
	oneDecimalFormatter,
	pluralCount,
} from "@/features/reports/utils/format";
import { cn } from "@/lib/utils";

// "Mr. Jermain Hamill Jr." → "JH": titles and suffixes would make every
// circle read "MJ" or "DF".
const initialsOf = (name: string) =>
	name
		.split(/[\s-]+/)
		.filter((part) => part && !part.endsWith("."))
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");

interface InitialsProps {
	name: string;
}

export const Initials = ({ name }: InitialsProps) => (
	<span
		aria-hidden="true"
		className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-medium text-caption"
	>
		{initialsOf(name)}
	</span>
);

interface PersonNameProps {
	name: string;
	children: ReactNode;
	detail?: ReactNode;
}

// A person's row title: initials, the name, and an optional line under it.
export const PersonName = ({ name, children, detail }: PersonNameProps) => (
	<span className="flex items-center gap-2.5">
		<Initials name={name} />
		<span className="grid min-w-0 gap-0.5">
			<span className="font-medium lg:line-clamp-2">{children}</span>
			{detail}
		</span>
	</span>
);

interface ShareBarProps {
	value: number;
	max: number;
	className?: string;
}

// Scaled to the biggest figure in the same table, so rows compare by eye.
export const ShareBar = ({ value, max, className }: ShareBarProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"block h-1.5 overflow-hidden rounded-full bg-soft-bar-track",
			className,
		)}
	>
		<span
			className="block h-full rounded-full bg-soft-bar"
			style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
		/>
	</span>
);

interface CountBarProps {
	value: number;
	max: number;
}

export const CountBar = ({ value, max }: CountBarProps) => (
	<span className="ml-auto grid w-full max-w-30 justify-items-end gap-1.5">
		<span className="font-medium tabular-nums">
			{numberFormatter.format(value)}
		</span>
		<ShareBar value={value} max={max} className="w-full" />
	</span>
);

export const paceText = (perDay: number | null) =>
	perDay === null ? "—" : `${oneDecimalFormatter.format(perDay)}/day`;

interface PaceProps {
	perDay: number | null;
	days: number;
}

export const Pace = ({ perDay, days }: PaceProps) => (
	<span className="grid justify-items-end gap-0.5 tabular-nums">
		<span>{paceText(perDay)}</span>
		<span className="text-muted-foreground text-subhead">
			{pluralCount(days, "day")}
		</span>
	</span>
);
