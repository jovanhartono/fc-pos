import { Progress, ProgressLabel } from "@/components/ui/progress";

interface ItemsProgressProps {
	done: number;
	total: number;
}

// How many of an Order's Items are finished or collected, so the counter sees
// "2/3" before the customer asks whether everything is done.
export const ItemsProgress = ({ done, total }: ItemsProgressProps) => {
	if (total === 0) {
		return <span className="text-muted-foreground">—</span>;
	}
	return (
		<Progress className="grid w-20 gap-1" max={total} value={done}>
			<ProgressLabel className="text-subhead tabular-nums">{`${done}/${total}`}</ProgressLabel>
		</Progress>
	);
};
