import type { ReactNode } from "react";
import { pluralize } from "@/shared/utils";

interface SummaryLineProps {
	children: ReactNode;
}

export const SummaryLine = ({ children }: SummaryLineProps) => (
	<p className="flex flex-wrap items-baseline gap-x-4.5 gap-y-1.5 text-body">
		{children}
	</p>
);

interface SummaryValueProps {
	value: string | number;
	label: string;
}

export const SummaryValue = ({ value, label }: SummaryValueProps) => (
	<span>
		<span className="mr-1 font-medium text-title-3 tabular-nums">{value}</span>
		{label}
	</span>
);

interface ForgottenNoteProps {
	count: number;
}

export const ForgottenNote = ({ count }: ForgottenNoteProps) =>
	count > 0 ? (
		<span className="text-subhead text-tone-bad-foreground">
			{pluralize(count, "Forgotten clock-out")} to check
		</span>
	) : null;
