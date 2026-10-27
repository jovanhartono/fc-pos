import { Section } from "@/components/section";
import type { WorkerRow } from "@/features/reports/api";
import { WorkerName } from "@/features/reports/components/workers-table";
import { useStoreCodes } from "@/features/reports/hooks/useStoreCodes";
import { needsALook } from "@/features/reports/utils/workers-report";
import { useMinuteClock } from "@/hooks/useMinuteClock";

interface NeedsALookProps {
	workers: WorkerRow[];
}

// What the owner should ask about today, whatever range the rest shows.
export const NeedsALook = ({ workers }: NeedsALookProps) => {
	const now = useMinuteClock();
	const storeCodes = useStoreCodes();
	const flags = needsALook(workers, now);
	if (flags.length === 0) {
		return null;
	}
	return (
		<Section id="workers-needs-a-look" title="Needs a Look">
			<ul className="divide-y divide-border rounded-lg border bg-card text-body">
				{flags.map(({ key, row, before, problem, after }) => (
					<li key={key} className="flex items-baseline gap-3 px-4 py-3">
						<span
							aria-hidden="true"
							className="size-2 shrink-0 self-center rounded-full bg-tone-bad-foreground"
						/>
						<span className="min-w-0 flex-1">
							<span className="mr-2 font-medium">
								<WorkerName name={row.user_name} role={row.role} />
							</span>
							<span className="text-muted-foreground">
								{before}
								<span className="text-tone-bad-foreground">{problem}</span>
								{after}
							</span>
						</span>
						<span className="hidden text-muted-foreground sm:inline">
							{storeCodes.get(row.store_id) ?? row.store_name}
						</span>
					</li>
				))}
			</ul>
		</Section>
	);
};
