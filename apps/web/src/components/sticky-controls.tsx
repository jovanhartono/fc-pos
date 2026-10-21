import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface StickyControlsProps {
	children: ReactNode;
	className?: string;
}

// A worker deep in a long queue can still search, scan or switch status
// without scrolling back up. The negative top cancels the page's top padding,
// so the bar sits flush under the phone's top bar.
export const StickyControls = ({
	children,
	className,
}: StickyControlsProps) => {
	const ref = useRef<HTMLDivElement>(null);

	// The hairline only shows once rows slide under the bar; at the top of the
	// page it would draw a stray line between the controls and the list.
	useEffect(() => {
		const bar = ref.current;
		const pane = bar?.closest<HTMLElement>("[data-scroll-restoration-id]");
		if (!(bar && pane)) {
			return;
		}
		let offset = 0;
		const measure = () => {
			offset =
				Number.parseFloat(getComputedStyle(pane).paddingTop) +
				Number.parseFloat(getComputedStyle(bar).top);
		};
		const update = () => {
			const stuckAt = pane.getBoundingClientRect().top + offset;
			bar.toggleAttribute(
				"data-stuck",
				pane.scrollTop > 0 && bar.getBoundingClientRect().top <= stuckAt + 0.5,
			);
		};
		const handleResize = () => {
			measure();
			update();
		};
		handleResize();
		pane.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", handleResize);
		return () => {
			pane.removeEventListener("scroll", update);
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	return (
		<div
			ref={ref}
			className={cn(
				"page-bleed sticky -top-(--page-top) z-40 -my-2 bg-frost py-2 backdrop-blur-xl backdrop-saturate-150 transition-shadow data-stuck:shadow-[0_0.5px_0_var(--border)]",
				className,
			)}
		>
			{children}
		</div>
	);
};
