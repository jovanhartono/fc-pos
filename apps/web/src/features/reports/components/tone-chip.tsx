import { Badge } from "@/components/ui/badge";
import { numberFormatter } from "@/features/reports/utils/format";
import {
	complaintTone,
	outOf,
	qcText,
	qcTone,
	type Tone,
} from "@/features/reports/utils/workers-report";

const TONE_VARIANT = {
	neutral: "secondary",
	good: "success",
	warn: "warning",
	bad: "danger",
} as const satisfies Record<Tone, string>;

interface QcChipProps {
	rejects: number;
	checks: number;
	// "QC " on phone cards, where the chip has no column header above it.
	prefix?: string;
}

export const QcChip = ({ rejects, checks, prefix = "" }: QcChipProps) => (
	<Badge
		className="tabular-nums"
		variant={TONE_VARIANT[qcTone(rejects, checks)]}
	>
		{`${prefix}${qcText(rejects, checks)}`}
	</Badge>
);

interface BadCountProps {
	bad: number;
	total: number;
	// Words before the figure where no column header names it, as on a phone card.
	prefix?: string;
	zeroClassName?: string;
}

// A QC reject or a Complaint is the only thing that turns red; nothing checked
// or finished is "—", none sent back is a plain 0. The count stands alone: its
// row already shows the work it came from, and a second number there confused.
export const BadCount = ({
	bad,
	total,
	prefix = "",
	zeroClassName = "text-muted-foreground",
}: BadCountProps) => {
	if (total === 0) {
		return <span className="text-muted-foreground">—</span>;
	}
	if (bad === 0) {
		return <span className={zeroClassName}>0</span>;
	}
	return (
		<Badge className="tabular-nums" variant="danger">
			{`${prefix}${numberFormatter.format(bad)}`}
		</Badge>
	);
};

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
	<Badge
		className="tabular-nums"
		variant={TONE_VARIANT[complaintTone(complaints, finished)]}
	>
		{`${prefix}${outOf(complaints, finished)}`}
	</Badge>
);
