interface ReworkRoundLabelProps {
	round: number;
	serviceName: string;
}

// Drawn under the line it redoes, so the eye takes the treatment from the row
// above; a screen reader, which cannot, hears it spelled out.
export const ReworkRoundLabel = ({
	round,
	serviceName,
}: ReworkRoundLabelProps) => (
	<>
		Rework {round}
		<span className="sr-only"> of {serviceName}</span>
	</>
);
