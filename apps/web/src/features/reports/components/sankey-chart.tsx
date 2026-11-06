import { ResponsiveContainer, Sankey } from "recharts";
import { compactMoney } from "@/features/reports/utils/format";

export interface SankeyNodeDatum {
	name: string;
	displayValue: number;
	color: string;
	labelTone: string;
}

export interface SankeyLinkDatum {
	source: number;
	target: number;
	value: number;
	color: string;
	opacity: number;
}

interface SankeyLinkRenderProps {
	sourceX: number;
	targetX: number;
	sourceY: number;
	targetY: number;
	sourceControlX: number;
	targetControlX: number;
	linkWidth: number;
	payload: unknown;
}

interface SankeyNodeRenderProps {
	x: number;
	y: number;
	width: number;
	height: number;
	payload: unknown;
}

interface SankeyChartProps {
	nodes: SankeyNodeDatum[];
	links: SankeyLinkDatum[];
}

export const SankeyChart = ({ nodes, links }: SankeyChartProps) => (
	<ResponsiveContainer
		height={320}
		initialDimension={{ height: 320, width: 720 }}
		minWidth={0}
		width="100%"
	>
		<Sankey
			data={{ nodes, links }}
			link={(props) => <SankeyLink {...props} />}
			margin={{ bottom: 32, left: 8, right: 156, top: 12 }}
			node={(props) => <SankeyNode {...props} />}
			nodePadding={24}
			nodeWidth={6}
		/>
	</ResponsiveContainer>
);

const SankeyLink = ({
	sourceX,
	targetX,
	sourceY,
	targetY,
	sourceControlX,
	targetControlX,
	linkWidth,
	payload,
}: SankeyLinkRenderProps) => {
	const datum = payload as SankeyLinkDatum;
	const path = `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;

	return (
		<path
			d={path}
			fill="none"
			stroke={datum.color}
			strokeLinecap="butt"
			strokeOpacity={datum.opacity}
			strokeWidth={Math.max(linkWidth, 1)}
		/>
	);
};

const SankeyNode = ({
	x,
	y,
	width,
	height,
	payload,
}: SankeyNodeRenderProps) => {
	const datum = payload as SankeyNodeDatum;
	const labelX = x + width + 6;
	const labelY = y + height / 2;
	return (
		<g>
			<rect
				fill={datum.color}
				height={height}
				opacity={0.95}
				width={width}
				x={x}
				y={y}
			/>
			<text fontSize={11} x={labelX} y={labelY - 1}>
				<tspan fill={datum.labelTone}>{datum.name}</tspan>
			</text>
			<text fontSize={11} fontWeight={600} x={labelX} y={labelY + 12}>
				<tspan className="tabular-nums" fill="var(--foreground)">
					{compactMoney(datum.displayValue)}
				</tspan>
			</text>
		</g>
	);
};
