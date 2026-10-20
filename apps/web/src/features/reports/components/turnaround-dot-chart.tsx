import { useEffect, useMemo, useRef, useState } from "react";
import type { TurnaroundReport } from "@/features/reports/api";
import {
	PERCENTILE_KEYS,
	TURNAROUND_COLORS,
} from "@/features/reports/utils/palette";
import {
	axisMaxHours,
	dayTickHours,
	jitter,
	longDuration,
	shortDay,
	shortDuration,
} from "@/features/reports/utils/turnaround";

type TurnaroundItem = TurnaroundReport["items"][number];

interface TurnaroundDotChartProps {
	// `index` is the Item's place in the whole report, so its height holds still
	// while the owner flips between Categories.
	dots: { index: number; item: TurnaroundItem }[];
	row: Pick<TurnaroundReport["rows"][number], "p75" | "p90" | "p99">;
}

interface HoverState {
	dot: number;
	left: number;
	top: number;
}

const LABEL_BAND = 36;
const DOT_PAD = 4;
const HIT_RADIUS = 12;
const TOOLTIP_WIDTH = 256;

const useElementWidth = () => {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const node = ref.current;
		if (!node) {
			return;
		}
		const observer = new ResizeObserver(([entry]) =>
			setWidth(Math.floor(entry.contentRect.width)),
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
};

export const TurnaroundDotChart = ({ dots, row }: TurnaroundDotChartProps) => {
	const { ref, width } = useElementWidth();
	const [hover, setHover] = useState<HoverState | null>(null);
	// Switching Category keeps the chart mounted, so the page doesn't jump; an
	// open tooltip would point at another Item, so it closes.
	const [shownDots, setShownDots] = useState(dots);
	if (shownDots !== dots) {
		setShownDots(dots);
		setHover(null);
	}
	useEffect(() => {
		const hide = () => setHover(null);
		const hideOutside = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) {
				hide();
			}
		};
		window.addEventListener("scroll", hide, true);
		window.addEventListener("pointerdown", hideOutside);
		return () => {
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("pointerdown", hideOutside);
		};
	}, [ref]);
	const max = useMemo(
		() =>
			axisMaxHours(
				row.p99,
				dots.map((d) => d.item.hours),
			),
		[dots, row.p99],
	);
	const height = width < 480 ? 170 : 210;
	const xOf = (hours: number) => (Math.min(hours, max) / max) * width;
	const points = useMemo(() => {
		const plotHeight = height - LABEL_BAND;
		return dots.map(({ index, item }) => ({
			item,
			x: (Math.min(item.hours, max) / max) * width,
			y: LABEL_BAND + DOT_PAD + jitter(index) * (plotHeight - DOT_PAD * 2),
			over: item.hours > max,
		}));
	}, [dots, height, max, width]);
	const ticks = useMemo(() => dayTickHours(max), [max]);

	// One handler on the plot, so a phone tap finds the nearest dot instead of
	// needing a 6px target.
	const handlePoint = (event: React.PointerEvent<SVGSVGElement>) => {
		const box = event.currentTarget.getBoundingClientRect();
		const px = event.clientX - box.left;
		const py = event.clientY - box.top;
		let best = -1;
		let bestDistance = HIT_RADIUS;
		points.forEach((p, i) => {
			const distance = Math.hypot(p.x - px, p.y - py);
			if (distance < bestDistance) {
				best = i;
				bestDistance = distance;
			}
		});
		if (best === -1) {
			setHover(null);
			return;
		}
		if (best === hover?.dot) {
			return;
		}
		setHover({
			dot: best,
			left: box.left + points[best].x,
			top: box.top + points[best].y,
		});
	};

	// A phone has no hover: the browser sends pointerleave as the finger lifts,
	// which would hide the tooltip the owner just tapped open.
	const handleLeave = (event: React.PointerEvent<SVGSVGElement>) => {
		if (event.pointerType === "mouse") {
			setHover(null);
		}
	};

	const hovered = hover ? points[hover.dot] : null;
	const flip = hover
		? hover.left + TOOLTIP_WIDTH + 18 > window.innerWidth
		: false;

	return (
		<div ref={ref} className="relative min-w-0">
			{width > 0 && (
				<>
					<svg
						aria-hidden="true"
						className="block touch-pan-y overflow-visible"
						height={height}
						onPointerDown={handlePoint}
						onPointerLeave={handleLeave}
						onPointerMove={handlePoint}
						width={width}
					>
						{ticks.map((t) => (
							<line
								key={t}
								stroke="var(--border)"
								x1={xOf(t)}
								x2={xOf(t)}
								y1={0}
								y2={height}
							/>
						))}
						{points.map((p, i) => (
							<circle
								cx={p.x}
								cy={p.y}
								fill={p.over ? "none" : TURNAROUND_COLORS.dot}
								fillOpacity={i === hover?.dot ? 1 : 0.45}
								key={`${p.item.ready_day}-${i}`}
								r={p.over ? 3.2 : 3}
								stroke={p.over ? TURNAROUND_COLORS.dot : "none"}
							/>
						))}
						{PERCENTILE_KEYS.map(([key, color], n) => {
							const value = row[key];
							if (value === null || value > max) {
								return null;
							}
							const x = xOf(value);
							return (
								<g key={key}>
									<line
										stroke={color}
										strokeWidth={2}
										x1={x}
										x2={x}
										y1={LABEL_BAND - 2}
										y2={height}
									/>
									<text
										fill={color}
										fontSize={11}
										fontWeight={600}
										textAnchor={x > width - 60 ? "end" : "middle"}
										x={x}
										y={10 + n * 11}
									>
										{key} {shortDuration(value)}
									</text>
								</g>
							);
						})}
					</svg>
					<svg aria-hidden="true" className="block" height={16} width={width}>
						{ticks
							.filter((t) => xOf(t) <= width - 64)
							.map((t) => (
								<text
									fill="var(--muted-foreground)"
									fontSize={11}
									key={t}
									textAnchor={t === 0 ? "start" : "middle"}
									x={xOf(t)}
									y={12}
								>
									{t / 24}d
								</text>
							))}
						<text
							fill="var(--muted-foreground)"
							fontSize={11}
							textAnchor="end"
							x={width}
							y={12}
						>
							○ slower
						</text>
					</svg>
				</>
			)}
			{hover !== null && hovered !== null && (
				<div
					className="pointer-events-none fixed z-50 max-w-64 rounded-md border bg-popover px-2.5 py-2 text-footnote text-popover-foreground shadow-lg"
					style={{
						left: flip ? hover.left - 10 : hover.left + 10,
						top: hover.top,
						transform: flip ? "translate(-100%, -50%)" : "translateY(-50%)",
					}}
				>
					<strong className="font-semibold">
						{longDuration(hovered.item.hours)}
					</strong>
					{` · ready ${shortDay(hovered.item.ready_day)} · ${hovered.item.store_code}`}
					{hovered.item.priority ? " · Priority" : ""}
					{hovered.item.services.map((service) => (
						<p key={service}>{service}</p>
					))}
				</div>
			)}
		</div>
	);
};
