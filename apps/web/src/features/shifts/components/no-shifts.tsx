import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EmptyState } from "@/components/empty-state";

export const NoShifts = () => (
	<EmptyState className="px-3 py-7">
		<span className="mx-auto mb-2.5 grid size-10 place-items-center rounded-full bg-secondary">
			<HugeiconsIcon icon={Clock01Icon} className="size-5" />
		</span>
		No shifts.
	</EmptyState>
);
