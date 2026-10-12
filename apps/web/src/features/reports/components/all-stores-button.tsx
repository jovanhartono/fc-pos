import { ArrowLeftIcon } from "@phosphor-icons/react";

interface AllStoresButtonProps {
	onClick: () => void;
}

export const AllStoresButton = ({ onClick }: AllStoresButtonProps) => (
	<button
		type="button"
		onClick={onClick}
		className="inline-flex items-center gap-1 justify-self-start text-[13px] text-muted-foreground hover:text-foreground"
	>
		<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
		All stores
	</button>
);
