interface KeyHintProps {
	keys: string[];
	label?: string;
	className?: string;
}

// One look for every keyboard hint, so the table strip, the command bar and
// the sidebar's ⌘K read as the same keys.
export const KeyHint = ({ keys, label, className }: KeyHintProps) => (
	<span className={className ?? "inline-flex items-center gap-1.5"}>
		{keys.map((key) => (
			<kbd
				key={key}
				className="inline-grid h-5 min-w-5 place-items-center border border-b-2 bg-background px-1 font-mono text-[11px] text-foreground"
			>
				{key}
			</kbd>
		))}
		{label}
	</span>
);
