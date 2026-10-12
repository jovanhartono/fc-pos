import type { ReactNode } from "react";

const HEADING_CLASS =
	"flex items-center gap-2 text-sm font-semibold text-foreground";

export const ReportSkeleton = () => (
	<div className="grid gap-6">
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			{Array.from({ length: 4 }, (_, index) => (
				<div key={index} className="h-24 animate-pulse bg-muted/40" />
			))}
		</div>
		<div className="h-48 animate-pulse bg-muted/40" />
	</div>
);

interface ReportSectionProps {
	id: string;
	title: ReactNode;
	aside?: ReactNode;
	children: ReactNode;
}

export const ReportSection = ({
	id,
	title,
	aside,
	children,
}: ReportSectionProps) => (
	<section aria-labelledby={id} className="grid gap-3">
		<div className="flex min-h-8 items-center justify-between gap-3">
			<h2 id={id} className={HEADING_CLASS}>
				{title}
			</h2>
			{aside}
		</div>
		{children}
	</section>
);
