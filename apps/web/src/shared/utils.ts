import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Without the type scale names, cn("text-body text-muted-foreground") reads
// text-body as a colour and drops it, and the line falls back to 16px.
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: [
				"caption",
				"footnote",
				"subhead",
				"body",
				"headline",
				"title-3",
				"title-2",
				"title-1",
				"large-title",
				"field",
			],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const pluralize = (count: number, noun: string): string =>
	`${count} ${count === 1 ? noun : `${noun}s`}`;

export const getNumericValue = (formattedValue: string): string => {
	return formattedValue.replaceAll(/[^\d]/g, "");
};
