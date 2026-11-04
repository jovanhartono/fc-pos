import type { ReactNode } from "react";
import { oneDecimalFormatter } from "@/features/reports/utils/format";

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

const Initials = ({ name }: InitialsProps) => (
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

export const paceText = (perDay: number | null) =>
	perDay === null ? "—" : `${oneDecimalFormatter.format(perDay)}/day`;

interface PaceProps {
	perDay: number | null;
	// What the pace is over: "15 days" on a person, "per checker" on Team.
	detail: string;
}

export const Pace = ({ perDay, detail }: PaceProps) => (
	<span className="grid justify-items-end gap-0.5 tabular-nums">
		<span>{paceText(perDay)}</span>
		<span className="font-normal text-muted-foreground text-subhead">
			{detail}
		</span>
	</span>
);
