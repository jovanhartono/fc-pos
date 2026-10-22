import {
	AlertCircleIcon,
	CancelCircleIcon,
	CheckmarkCircle02Icon,
	InformationCircleIcon,
	Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="system"
			className="toaster group"
			icons={{
				success: (
					<HugeiconsIcon
						icon={CheckmarkCircle02Icon}
						className="size-4 text-success"
					/>
				),
				info: <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />,
				warning: <HugeiconsIcon icon={AlertCircleIcon} className="size-4" />,
				error: (
					<HugeiconsIcon
						icon={CancelCircleIcon}
						className="size-4 text-destructive"
					/>
				),
				loading: (
					<HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
				),
			}}
			style={
				{
					"--normal-bg": "color-mix(in srgb, var(--popover) 85%, transparent)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "transparent",
					"--border-radius": "var(--radius-2xl)",
				} as CSSProperties
			}
			toastOptions={{
				classNames: {
					toast:
						"cn-toast border-0! shadow-[0_8px_24px_rgb(0_0_0/0.12)]! backdrop-blur-xl backdrop-saturate-150",
					// Buttons sit 16px in from the toast's edge, so their corners are the
					// toast's minus 16px and the two curves run parallel.
					actionButton:
						"h-7! rounded-[calc(var(--radius-2xl)-16px)]! bg-primary! px-3! font-medium! text-primary-foreground! text-subhead! hover:bg-primary/90!",
					closeButton:
						"static! order-last size-7! shrink-0 transform-none! rounded-[calc(var(--radius-2xl)-16px)]! border-0! bg-transparent! text-muted-foreground! hover:bg-muted! [&_svg]:size-3.5",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
