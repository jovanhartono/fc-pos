import { cn } from "@/lib/utils";

// Content that replaces a skeleton fades in over it instead of cutting in.
// Opacity only, so nothing moves; reduced motion gets the plain swap.
export const CONTENT_FADE =
	"animate-in fade-in duration-200 motion-reduce:animate-none";

// A cashier changing a filter keeps the last rows on screen, faded, until the
// new ones land in their place, instead of the list blinking empty.
export const staleFade = (isStale: boolean | undefined) =>
	cn(
		"transition-opacity duration-200 motion-reduce:transition-none",
		isStale && "opacity-60",
	);
