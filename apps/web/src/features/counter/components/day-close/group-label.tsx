import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const LINE_ROW =
	"grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3.5 px-3 pt-1.5 pb-2 text-left tabular-nums";

interface LineNameProps {
	children: ReactNode;
}

// A long Service name wraps under its own text, not under the dot.
export const LineName = ({ children }: LineNameProps) => (
	<span className="-indent-4 pl-4">
		<span
			aria-hidden="true"
			className="mr-2.5 inline-block size-1.5 rounded-full bg-muted-foreground/55 align-[2px]"
		/>
		{children}
	</span>
);

interface GroupLabelProps {
	end: ReactNode;
	onClick?: () => void;
	title: ReactNode;
}

const GROUP_LABEL =
	"grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 px-3 pt-2.5 pb-0.5 text-left text-footnote text-muted-foreground tabular-nums";

// The grey heading over a group's lines: a terminal slip over its methods,
// a category over its Services.
export const GroupLabel = ({ end, onClick, title }: GroupLabelProps) => {
	const children = (
		<>
			<span>{title}</span>
			<span className="text-right">{end}</span>
		</>
	);
	return onClick ? (
		<button
			className={cn(GROUP_LABEL, "hover:bg-muted")}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	) : (
		<div className={GROUP_LABEL}>{children}</div>
	);
};
