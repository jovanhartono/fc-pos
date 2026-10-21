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
					"--border-radius": "20px",
				} as CSSProperties
			}
			toastOptions={{
				classNames: {
					toast:
						"cn-toast border-0! shadow-[0_8px_24px_rgb(0_0_0/0.12)]! backdrop-blur-xl backdrop-saturate-150",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
