import type {
	FieldErrors,
	UseFormHandleSubmit,
	UseFormRegister,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
		<div className="grid min-h-dvh place-items-center bg-muted/20 px-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-xl">Sign in</CardTitle>
					<CardDescription>
						Use your existing Fresclean credentials.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
						<Field data-invalid={!!errors.username}>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input
								id="username"
								autoComplete="username"
								placeholder="Enter username"
								aria-invalid={!!errors.username}
								{...register("username")}
							/>
							<FieldError errors={[errors.username]} />
						</Field>

						<Field data-invalid={!!errors.password}>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								type="password"
								autoComplete="current-password"
								placeholder="Enter password"
								aria-invalid={!!errors.password}
								{...register("password")}
							/>
							<FieldError errors={[errors.password]} />
						</Field>

						<Button
							type="submit"
							loading={isSubmitting}
							loadingText="Signing in..."
						>
							Sign in
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
