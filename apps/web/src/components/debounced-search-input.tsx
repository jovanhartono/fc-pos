import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
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
		<SearchInput
			// What the lists' "/" shortcut jumps to.
			data-list-search
			id={id}
			value={internalValue}
			onChange={(event) => handleChange(event.target.value)}
			placeholder={placeholder}
			aria-label={ariaLabel}
			className={className}
			inputClassName={cn("pr-9", inputClassName)}
			end={
				internalValue ? (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Clear search"
						icon={<HugeiconsIcon icon={Cancel01Icon} className="size-4" />}
						className="absolute right-1"
						onClick={handleClear}
					/>
				) : null
			}
		/>
	);
}
