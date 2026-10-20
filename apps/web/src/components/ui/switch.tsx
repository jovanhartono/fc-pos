"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({
	className,
	size = "default",
	...props
}: SwitchPrimitive.Root.Props & {
	size?: "sm" | "default";
}) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			data-size={size}
			className={cn(
				"peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 data-[size=default]:h-[26px] data-[size=default]:w-[42px] data-[size=default]:p-px pointer-coarse:data-[size=default]:h-[31px] pointer-coarse:data-[size=default]:w-[51px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-success data-unchecked:bg-secondary data-disabled:cursor-not-allowed data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none block rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.18)] ring-0 transition-transform group-data-[size=default]/switch:size-[22px] pointer-coarse:group-data-[size=default]/switch:size-[27px] group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-4 pointer-coarse:group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
