import type { ReactNode } from "react";
import { Section } from "@/components/section";
import type { WorkerRow } from "@/features/reports/api";
import { WorkerName } from "@/features/reports/components/workers-table";
import { useStoreCodes } from "@/features/reports/hooks/useStoreCodes";
import { needsALook } from "@/features/reports/utils/workers-report";
import { useMinuteClock } from "@/hooks/useMinuteClock";

export interface NeedsALookItem {
	key: string;
	name: ReactNode;
	// Plain text either side of the part shown in red.
	before: string;
	problem: string;
	after: string;
	aside?: ReactNode;
}

interface NeedsALookListProps {
	id: string;
	items: NeedsALookItem[];
}

export const NeedsALookList = ({ id, items }: NeedsALookListProps) => {
	if (items.length === 0) {
		return null;
	}
	return (
		<Section id={id} title="Needs a Look">
			<ul className="divide-y divide-border rounded-lg border bg-card text-body">
				{items.map(({ key, name, before, problem, after, aside }) => (
					<li key={key} className="flex items-baseline gap-3 px-4 py-3">
						<span
							aria-hidden="true"
							className="size-2 shrink-0 self-center rounded-full bg-tone-bad-foreground"
						/>
						<span className="min-w-0 flex-1">
							<span className="mr-2 font-medium">{name}</span>
							<span className="text-muted-foreground">
								{before}
								<span className="text-tone-bad-foreground">{problem}</span>
								{after}
							</span>
						</span>
						{aside === undefined ? null : (
							<span className="hidden text-muted-foreground sm:inline">
								{aside}
							</span>
						)}
					</li>
				))}
			</ul>
		</Section>
	);
};

interface NeedsALookProps {
	workers: WorkerRow[];
}

// What the owner should ask about today, whatever range the rest shows.
export const NeedsALook = ({ workers }: NeedsALookProps) => {
	const now = useMinuteClock();
	const storeCodes = useStoreCodes();
	return (
		<NeedsALookList
			id="workers-needs-a-look"
			items={needsALook(workers, now).map(({ row, ...flag }) => ({
				...flag,
				name: <WorkerName name={row.user_name} role={row.role} />,
				aside: storeCodes.get(row.store_id) ?? row.store_name,
			}))}
		/>
	);
};
