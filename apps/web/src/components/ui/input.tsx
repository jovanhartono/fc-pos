import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				// text-field on touch: iOS zooms the page into any field it focuses
				// that renders under 16px, and the cashier is left pinching back out.
				"h-9 pointer-coarse:h-11 w-full min-w-0 rounded-sm border border-input bg-background px-2.5 py-1 text-subhead pointer-coarse:text-field transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-footnote file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
