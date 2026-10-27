import type {
	FieldErrors,
	UseFormHandleSubmit,
	UseFormRegister,
} from "react-hook-form";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// The two fields sit in one block with a hairline between, like the Track form.
const GROUPED_INPUT_CLASS =
	"h-11 pointer-coarse:h-11 rounded-none border-0 bg-transparent px-3 text-body pointer-coarse:text-field focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent";

export type LoginFormValues = {
	username: string;
	password: string;
};

type LoginFormProps = {
	register: UseFormRegister<LoginFormValues>;
	handleSubmit: UseFormHandleSubmit<LoginFormValues>;
	onSubmit: (values: LoginFormValues) => Promise<void>;
	errors: FieldErrors<LoginFormValues>;
	isSubmitting: boolean;
};

export function LoginForm({
	register,
	handleSubmit,
	onSubmit,
	errors,
	isSubmitting,
}: LoginFormProps) {
	return (
		<div className="grid min-h-dvh place-items-center bg-background px-4">
			<form
				className="grid w-full max-w-sm gap-4"
				onSubmit={handleSubmit(onSubmit)}
			>
				<BrandLogo className="h-10 justify-self-center" />
				<h1 className="text-center font-bold text-title-2">Sign In</h1>
				<div className="overflow-hidden rounded-lg border bg-card">
					<Field data-invalid={!!errors.username}>
						<FieldLabel htmlFor="username" className="sr-only">
							Username
						</FieldLabel>
						<Input
							id="username"
							autoComplete="username"
							placeholder="Username"
							aria-invalid={!!errors.username}
							className={GROUPED_INPUT_CLASS}
							{...register("username")}
						/>
					</Field>
					<Field data-invalid={!!errors.password} className="border-t">
						<FieldLabel htmlFor="password" className="sr-only">
							Password
						</FieldLabel>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							placeholder="Password"
							aria-invalid={!!errors.password}
							className={GROUPED_INPUT_CLASS}
							{...register("password")}
						/>
					</Field>
				</div>
				<FieldError errors={[errors.username ?? errors.password]} />
				<Button
					type="submit"
					className="h-11 pointer-coarse:h-11 w-full"
					loading={isSubmitting}
					loadingText="Signing In..."
				>
					Sign In
				</Button>
			</form>
		</div>
	);
}
