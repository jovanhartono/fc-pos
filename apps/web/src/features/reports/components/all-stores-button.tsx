import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface AllStoresButtonProps {
	onClick: () => void;
}

export const AllStoresButton = ({ onClick }: AllStoresButtonProps) => (
	<button
		type="button"
		onClick={onClick}
		className="inline-flex items-center gap-1 justify-self-start text-subhead text-muted-foreground hover:text-foreground"
	>
		<HugeiconsIcon
			icon={ArrowLeft02Icon}
			aria-hidden="true"
			className="size-3.5"
		/>
		All stores
	</button>
);
