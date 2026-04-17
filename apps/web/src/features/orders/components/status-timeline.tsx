import { CaretRightIcon } from "@phosphor-icons/react";
import { formatOrderServiceStatus } from "@/lib/status";

type StatusLog = {
	id: number;
	to_status: string;
	created_at: string;
	changedBy?: { name: string } | null;
	note?: string | null;
};

export function StatusTimeline({ logs }: { logs: StatusLog[] }) {
	return (
		<details className="group">
			<summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden [&::marker]:hidden">
				<CaretRightIcon
					className="size-4 shrink-0 transition-transform group-open:rotate-90"
					aria-hidden="true"
				/>
				Timeline ({logs.length})
			</summary>
			<div className="mt-3 grid gap-2 border-l border-border pl-3">
				{logs.length > 0 ? (
					logs.map((log) => (
						<div key={log.id} className="grid gap-1 text-xs">
							<p className="font-medium">
								{formatOrderServiceStatus(log.to_status)}
							</p>
							<p className="text-muted-foreground">
								{`${log.changedBy?.name ?? "—"} · ${new Date(log.created_at).toLocaleString()}`}
							</p>
							{log.note ? (
								<p className="text-muted-foreground">{log.note}</p>
							) : null}
						</div>
					))
				) : (
					<p className="text-xs text-muted-foreground">
						No status updates yet.
					</p>
				)}
			</div>
		</details>
	);
}
