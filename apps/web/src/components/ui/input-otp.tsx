import { OTPField as OTPFieldPrimitive } from "@base-ui/react/otp-field";
import { MinusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { cn } from "@/lib/utils";

interface InputOTPProps extends OTPFieldPrimitive.Root.Props {}

export const InputOTP = ({ className, ...props }: InputOTPProps) => (
	<OTPFieldPrimitive.Root
		data-slot="input-otp"
		className={cn("flex items-center has-disabled:opacity-50", className)}
		{...props}
	/>
);

interface InputOTPGroupProps extends React.ComponentProps<"div"> {}

export const InputOTPGroup = ({ className, ...props }: InputOTPGroupProps) => (
	<div
		data-slot="input-otp-group"
		className={cn(
			"flex items-center rounded-sm has-aria-invalid:border-destructive has-aria-invalid:ring-1 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40",
			className,
		)}
		{...props}
	/>
);

interface InputOTPSlotProps extends OTPFieldPrimitive.Input.Props {}

export const InputOTPSlot = ({ className, ...props }: InputOTPSlotProps) => (
	<OTPFieldPrimitive.Input
		data-slot="input-otp-slot"
		className={cn(
			// text-field on touch: iOS zooms the page into any field it focuses
			// that renders under 16px.
			"relative m-0 flex size-8 items-center justify-center border-y border-r border-input bg-transparent p-0 text-center text-footnote pointer-coarse:text-field transition-all outline-none first:rounded-l-sm first:border-l last:rounded-r-sm disabled:cursor-not-allowed aria-invalid:border-destructive focus:z-10 focus:border-ring focus:ring-1 focus:ring-ring/50 focus:aria-invalid:border-destructive focus:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:focus:aria-invalid:ring-destructive/40",
			className,
		)}
		{...props}
	/>
);

interface InputOTPSeparatorProps extends OTPFieldPrimitive.Separator.Props {}

export const InputOTPSeparator = ({
	className,
	...props
}: InputOTPSeparatorProps) => (
	<OTPFieldPrimitive.Separator
		data-slot="input-otp-separator"
		className={cn(
			"flex items-center [&_svg:not([class*='size-'])]:size-4",
			className,
		)}
		{...props}
	>
		<HugeiconsIcon icon={MinusSignIcon} />
	</OTPFieldPrimitive.Separator>
);
