import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

const TONES = {
	good: "bg-tone-good text-tone-good-foreground",
	neutral: "bg-secondary text-muted-foreground",
	bad: "bg-tone-bad text-tone-bad-foreground",
	warn: "bg-tone-warn text-tone-warn-foreground",
};

export interface PaymentOutcomeProps {
	icon: IconSvgElement;
	tone: keyof typeof TONES;
	title: string;
	text: string;
	// Inside a Track page card rather than filling the counter's dialog.
	isCompact?: boolean;
}

// How a QRIS ended, the same at the counter and on the Customer's phone.
export const PaymentOutcome = ({
	icon,
	tone,
	title,
	text,
	isCompact = false,
}: PaymentOutcomeProps) => (
	<div
		className={cn(
			"grid justify-items-center text-center",
			isCompact ? "gap-1.5 pt-1" : "gap-2 pt-2",
		)}
	>
		<span
			className={cn(
				"mb-1 grid place-items-center rounded-full",
				isCompact ? "size-12" : "size-16",
				TONES[tone],
			)}
		>
			<HugeiconsIcon
				aria-hidden="true"
				className={isCompact ? "size-6" : "size-7"}
				icon={icon}
			/>
		</span>
		<p className="text-balance font-semibold text-title-3">{title}</p>
		<p
			className={cn(
				"text-balance text-muted-foreground",
				isCompact ? "text-subhead" : "max-w-72 text-body",
			)}
		>
			{text}
		</p>
	</div>
);
