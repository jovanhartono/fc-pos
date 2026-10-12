import type { ReactNode } from "react";
import {
	complaintTone,
	outOf,
	qcText,
	qcTone,
	type Tone,
} from "@/features/reports/utils/workers-report";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<Tone, string> = {
	neutral: "bg-tone-neutral text-tone-neutral-foreground",
	good: "bg-tone-good text-tone-good-foreground",
	warn: "bg-tone-warn text-tone-warn-foreground",
	bad: "bg-tone-bad text-tone-bad-foreground",
};

interface ToneChipProps {
	tone: Tone;
	children: ReactNode;
}

export const ToneChip = ({ tone, children }: ToneChipProps) => (
	<span
		className={cn(
			"inline-block whitespace-nowrap px-1.5 py-px text-[12.5px] tabular-nums",
			TONE_CLASS[tone],
		)}
	>
		{children}
	</span>
);

interface QcChipProps {
	rejects: number;
	checks: number;
	// "QC " on phone cards, where the chip has no column header above it.
	prefix?: string;
}

export const QcChip = ({ rejects, checks, prefix = "" }: QcChipProps) => (
	<ToneChip tone={qcTone(rejects, checks)}>
		{`${prefix}${qcText(rejects, checks)}`}
	</ToneChip>
);

interface ComplaintsChipProps {
	complaints: number;
	finished: number;
	prefix?: string;
}

export const ComplaintsChip = ({
	complaints,
	finished,
	prefix = "",
}: ComplaintsChipProps) => (
	<ToneChip tone={complaintTone(complaints, finished)}>
		{`${prefix}${outOf(complaints, finished)}`}
	</ToneChip>
);
