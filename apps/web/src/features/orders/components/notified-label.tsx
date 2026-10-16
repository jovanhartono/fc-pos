import { cn } from "@/shared/utils";

interface NotifiedLabelProps {
	className?: string;
}

export const NotifiedLabel = ({ className }: NotifiedLabelProps) => (
	<span
		className={cn(
			"whitespace-nowrap text-emerald-700 text-xs dark:text-emerald-400",
			className,
		)}
	>
		NOTIFIED
	</span>
);
