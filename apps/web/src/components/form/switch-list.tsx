import type { ReactNode } from "react";
import { FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

interface SwitchListProps {
	children: ReactNode;
}

// A form's toggles read as one grouped list, not a stack of separate cards.
export const SwitchList = ({ children }: SwitchListProps) => (
	<div className="col-span-full divide-y overflow-hidden rounded-lg border bg-card">
		{children}
	</div>
);

interface SwitchRowProps {
	id: string;
	title: string;
	description?: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
}

export const SwitchRow = ({
	id,
	title,
	description,
	checked,
	disabled,
	onCheckedChange,
}: SwitchRowProps) => (
	<FieldLabel
		htmlFor={id}
		className="w-full items-center gap-3 px-3 py-2.5 leading-snug"
	>
		<span className="grid min-w-0 flex-1 gap-0.5">
			<span className="font-medium text-body">{title}</span>
			{description ? (
				<span className="font-normal text-subhead">{description}</span>
			) : null}
		</span>
		<Switch
			checked={checked}
			disabled={disabled}
			id={id}
			onCheckedChange={(next) => onCheckedChange(!!next)}
		/>
	</FieldLabel>
);
