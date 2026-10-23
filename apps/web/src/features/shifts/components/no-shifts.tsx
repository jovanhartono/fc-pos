import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export const NoShifts = () => (
	<div className="flex flex-col items-center justify-center gap-2.5 px-3 py-7 text-center text-headline text-muted-foreground">
		<span className="grid size-10 place-items-center rounded-full bg-secondary">
			<HugeiconsIcon icon={Clock01Icon} className="size-5" />
		</span>
		No shifts.
	</div>
);
