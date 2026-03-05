import {
	CheckCircle,
	Info,
	SpinnerGap,
	WarningCircle,
	XCircle,
} from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="system"
			className="toaster group"
			icons={{
				success: <CheckCircle className="size-4" weight="duotone" />,
				info: <Info className="size-4" weight="duotone" />,
				warning: <WarningCircle className="size-4" weight="duotone" />,
				error: <XCircle className="size-4" weight="duotone" />,
				loading: <SpinnerGap className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
