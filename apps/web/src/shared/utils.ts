import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const pluralize = (count: number, noun: string): string =>
	`${count} ${count === 1 ? noun : `${noun}s`}`;

export const getNumericValue = (formattedValue: string): string => {
	return formattedValue.replaceAll(/[^\d]/g, "");
};
