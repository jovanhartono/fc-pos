import {
	CheckCircleIcon,
	InfoIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="system"
			className="toaster group"
			icons={{
				success: <CheckCircleIcon className="size-4 text-success" />,
				info: <InfoIcon className="size-4" />,
				warning: <WarningCircleIcon className="size-4" />,
				error: <XCircleIcon className="size-4 text-destructive" />,
				loading: <SpinnerGapIcon className="size-4 animate-spin" />,
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
