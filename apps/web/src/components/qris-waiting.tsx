import { WaitingLabel } from "@/components/waiting-label";
import { formatClock } from "@/lib/dayjs";

interface QrisWaitingProps {
	expiresAt: string;
	// Only the mock gateway sends a page beside its QR: it stands in for the
	// Customer's bank app.
	mockPageUrl: string | null;
}

export const QrisWaiting = ({ expiresAt, mockPageUrl }: QrisWaitingProps) => (
	<>
		{mockPageUrl ? (
			<a
				className="justify-self-center text-body text-link"
				href={mockPageUrl}
				rel="noopener"
				target="_blank"
			>
				Open Mock Payment Page
			</a>
		) : null}
		<div className="flex items-center justify-between gap-4 rounded-lg bg-muted px-4 py-3 text-body">
			<WaitingLabel>Waiting for payment</WaitingLabel>
			<span className="text-muted-foreground tabular-nums">
				Expires {formatClock(expiresAt)}
			</span>
		</div>
	</>
);
