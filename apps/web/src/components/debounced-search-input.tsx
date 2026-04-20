import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface DebouncedSearchInputProps {
	id: string;
	value: string;
	onDebouncedChange: (next: string) => void;
	placeholder?: string;
	ariaLabel?: string;
	className?: string;
	inputClassName?: string;
	delay?: number;
}

export function DebouncedSearchInput({
	id,
	value,
	onDebouncedChange,
	placeholder,
	ariaLabel,
	className,
	inputClassName,
	delay = 300,
}: DebouncedSearchInputProps) {
	const [internalValue, setInternalValue] = useState(value);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setInternalValue(value);
	}, [value]);

	useEffect(
		() => () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		},
		[],
	);

	const handleChange = (next: string) => {
		setInternalValue(next);
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}
		timerRef.current = setTimeout(() => {
			onDebouncedChange(next.trim());
		}, delay);
	};

	const handleClear = () => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}
		setInternalValue("");
		onDebouncedChange("");
	};

	return (
		<div className={cn("relative flex items-center", className)}>
			<MagnifyingGlassIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
			<Input
				id={id}
				value={internalValue}
				onChange={(event) => handleChange(event.target.value)}
				placeholder={placeholder}
				aria-label={ariaLabel}
				className={cn("h-10 w-full min-w-0 pl-9 pr-9", inputClassName)}
			/>
			{internalValue ? (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Clear search"
					icon={<XIcon className="size-4" />}
					className="absolute right-1"
					onClick={handleClear}
				/>
			) : null}
		</div>
	);
}
