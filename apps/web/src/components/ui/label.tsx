/** biome-ignore-all lint/a11y/noLabelWithoutControl: <reusable component> */
import { AsteriskIcon } from "@phosphor-icons/react";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({
	className,
	asterisk,
	children,
	...props
}: React.ComponentProps<"label"> & { asterisk?: boolean }) {
	return (
		<label
			data-slot="label"
			className={cn(
				"flex items-center gap-2 text-xs leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			{children}
			{asterisk ? (
				<AsteriskIcon aria-hidden="true" className="size-2 text-destructive" />
			) : null}
		</label>
	);
}

export { Label };
