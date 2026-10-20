import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps extends Omit<ComponentProps<typeof Input>, "type"> {
	inputClassName?: string;
	end?: ReactNode;
}

export const SearchInput = ({
	className,
	inputClassName,
	end,
	...props
}: SearchInputProps) => (
	<div className={cn("relative flex items-center", className)}>
		<MagnifyingGlassIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
		<Input {...props} className={cn("w-full min-w-0 pl-9", inputClassName)} />
		{end}
	</div>
);
