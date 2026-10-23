import { pluralize } from "@/shared/utils";

interface ForgottenNoteProps {
	count: number;
}

export const ForgottenNote = ({ count }: ForgottenNoteProps) =>
	count > 0 ? (
		<span className="text-subhead text-tone-bad-foreground">
			{pluralize(count, "Auto-closed Shift")} to check
		</span>
	) : null;
