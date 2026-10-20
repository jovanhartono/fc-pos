import type { ReactNode } from "react";

interface SectionTitleProps {
	id?: string;
	title: ReactNode;
	count?: ReactNode;
	as?: "h2" | "h3" | "span";
}

export const SectionTitle = ({
	id,
	title,
	count,
	as: Heading = "h2",
}: SectionTitleProps) => (
	<Heading id={id} className="font-semibold text-headline text-foreground">
		{title}
		{count ? (
			<span className="font-normal text-muted-foreground tabular-nums">
				{" "}
				· {count}
			</span>
		) : null}
	</Heading>
);

interface SectionProps {
	id?: string;
	title: ReactNode;
	count?: ReactNode;
	aside?: ReactNode;
	empty?: string;
	children?: ReactNode;
}

export const Section = ({
	id,
	title,
	count,
	aside,
	empty,
	children,
}: SectionProps) => (
	<section aria-labelledby={id} className="grid min-w-0 gap-2.5">
		<div className="flex items-center justify-between gap-3">
			<SectionTitle count={count} id={id} title={title} />
			{aside}
		</div>
		{children ||
			(empty ? <p className="text-muted-foreground">{empty}</p> : null)}
	</section>
);
