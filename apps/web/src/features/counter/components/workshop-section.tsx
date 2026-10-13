import { CaretRightIcon, InfoIcon } from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { CounterCategory } from "@/features/counter/api";

const MAX_QUOTED_ROWS = 6;

interface CategoryRowProps {
	category: CounterCategory;
}

const QuoteText = ({ category }: CategoryRowProps) => {
	if (!category.estimate) {
		return null;
	}
	const range = `${category.estimate.days_low}–${category.estimate.days_high} days`;
	if (category.after_clean) {
		return (
			<>
				<strong className="font-semibold">+{range}</strong>
				<span className="block text-muted-foreground text-xs">
					after the clean
				</span>
			</>
		);
	}
	return (
		<>
			about <strong className="font-semibold">{range}</strong>
		</>
	);
};

const CategoryRow = ({ category }: CategoryRowProps) => (
	<li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-border border-t px-3 py-2.5 first:border-t-0">
		<span className="font-medium">{category.name}</span>
		<span className="row-span-2 text-right whitespace-nowrap tabular-nums">
			<QuoteText category={category} />
		</span>
		<span className="text-muted-foreground text-xs tabular-nums">
			{category.not_started} not started · {category.in_progress} in progress
		</span>
	</li>
);

interface NotEnoughDataProps {
	categories: CounterCategory[];
}

// A popover, not a tooltip: a tap on a phone never opens a hover tooltip.
const NotEnoughData = ({ categories }: NotEnoughDataProps) => (
	<p className="border-border border-t px-3 py-2.5 text-muted-foreground text-xs leading-relaxed first:border-t-0">
		<Popover>
			<PopoverTrigger
				className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4"
				delay={100}
				openOnHover
			>
				Not enough data
				<InfoIcon aria-hidden="true" className="size-3.5" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64">
				A quote needs at least 7 finished in the last 4 weeks the Store was
				open. These Categories have fewer, so any number would be a guess.
			</PopoverContent>
		</Popover>
		{categories.map((category) => (
			<span key={category.category_id}>
				{" · "}
				{category.name}{" "}
				<strong className="font-medium text-foreground tabular-nums">
					{category.items_waiting}
				</strong>
			</span>
		))}
	</p>
);

interface CategoryBoxProps {
	categories: CounterCategory[];
	heading?: string;
}

const CategoryBox = ({ categories, heading }: CategoryBoxProps) => {
	if (categories.length === 0) {
		return null;
	}
	const quoted = categories.filter((category) => category.estimate);
	const unquoted = categories.filter((category) => !category.estimate);
	const folded = quoted.slice(MAX_QUOTED_ROWS);

	return (
		<div className="border border-border">
			{heading ? (
				<h3 className="bg-muted px-3 py-1.5 font-medium text-muted-foreground text-xs">
					{heading}
				</h3>
			) : null}
			<ul>
				{quoted.slice(0, MAX_QUOTED_ROWS).map((category) => (
					<CategoryRow category={category} key={category.category_id} />
				))}
			</ul>
			{folded.length > 0 ? (
				<details className="group border-border border-t">
					<summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2.5 font-medium [&::-webkit-details-marker]:hidden">
						<CaretRightIcon
							aria-hidden="true"
							className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90"
						/>
						{folded.length} more{" "}
						{folded.length === 1 ? "Category" : "Categories"}
					</summary>
					<ul className="border-border border-t">
						{folded.map((category) => (
							<CategoryRow category={category} key={category.category_id} />
						))}
					</ul>
				</details>
			) : null}
			{unquoted.length > 0 ? <NotEnoughData categories={unquoted} /> : null}
		</div>
	);
};

interface WorkshopSectionProps {
	categories: CounterCategory[];
}

export const WorkshopSection = ({ categories }: WorkshopSectionProps) => {
	// The server already sends the busiest Category first.
	const cleaning = categories.filter((category) => !category.after_clean);
	const afterClean = categories.filter((category) => category.after_clean);

	return (
		<section className="grid gap-2.5">
			<h2 className="font-semibold text-[15px]">Workshop now</h2>
			{categories.length === 0 ? (
				<p className="text-muted-foreground">Nothing waiting.</p>
			) : null}
			<CategoryBox categories={cleaning} />
			<CategoryBox categories={afterClean} heading="After the clean" />
		</section>
	);
};
