import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { type ComponentProps, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

export const PasswordInput = ({ className, ...props }: PasswordInputProps) => {
	const [isRevealed, setIsRevealed] = useState(false);

	return (
		<div className="relative">
			<Input
				{...props}
				// Revealed, the field is a plain text input — on the counter iPad iOS
				// would capitalise and autocorrect the password the admin is typing.
				type={isRevealed ? "text" : "password"}
				autoComplete="new-password"
				autoCapitalize="off"
				autoCorrect="off"
				spellCheck={false}
				className={cn("pr-10", className)}
			/>
			<button
				type="button"
				onClick={() => setIsRevealed((revealed) => !revealed)}
				disabled={props.disabled}
				aria-label={isRevealed ? "Hide password" : "Show password"}
				aria-pressed={isRevealed}
				className="absolute top-1/2 right-0 flex h-full w-10 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
			>
				{isRevealed ? (
					<EyeSlashIcon aria-hidden="true" className="size-4" />
				) : (
					<EyeIcon aria-hidden="true" className="size-4" />
				)}
			</button>
		</div>
	);
};
