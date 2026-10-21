import { cn } from "@/lib/utils";

interface BrandLogoProps {
	className?: string;
}

// The receipt logo is black type on a solid white block. Multiply hides the
// white on a light background; invert plus screen does the same in dark mode.
export const BrandLogo = ({ className }: BrandLogoProps) => (
	<img
		src="/receipt-logo.webp"
		alt="Fresclean"
		width={2000}
		height={632}
		className={cn(
			"w-auto mix-blend-multiply dark:invert dark:mix-blend-screen",
			className,
		)}
	/>
);
