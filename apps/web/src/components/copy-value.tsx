import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyValueProps {
	// Renders in place of the plain value, for codes that are also links.
	children?: ReactNode;
	className?: string;
	// What the value is, lower case: "order code", "phone number", "item tag".
	label: string;
	value: string;
}

export const CopyValue = ({
	children,
	className,
	label,
	value,
}: CopyValueProps) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) {
			return;
		}
		const timer = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(timer);
	}, [copied]);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch {
			// Clipboard writes are refused outside a secure context, and the
			// cashier still needs the number — leave it selectable and say so.
			toast.error(`Could not copy the ${label}. Select it to copy by hand.`);
		}
	};

	return (
		<span className={cn("inline-flex items-center gap-1", className)}>
			{children ?? <span>{value}</span>}
			<Button
				aria-label={copied ? `${label} copied` : `Copy ${label}`}
				className="pointer-coarse:size-7"
				icon={
					copied ? (
						<CheckIcon weight="bold" />
					) : (
						// Thin strokes at this size read as a smudge next to the order
						// code a cashier is trying to copy off the screen.
						<CopyIcon weight="bold" />
					)
				}
				onClick={handleCopy}
				size="icon-xs"
				variant="ghost"
			/>
		</span>
	);
};
