import { PUTOwnPasswordSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { onlineManager, useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import {
	type ChangeOwnPasswordPayload,
	changeOwnPassword,
} from "@/features/users/api";
import { PasswordInput } from "@/features/users/components/password-input";
import { readServerErrorMessage } from "@/lib/server-error";

const FIELDS = [
	{
		name: "current_password",
		label: "Current password",
		hint: "The one you sign in with now.",
		autoComplete: "current-password",
	},
	{
		name: "password",
		label: "New password",
		hint: "At least 8 characters.",
		autoComplete: "new-password",
	},
	{
		name: "confirm_password",
		label: "Confirm new password",
		hint: "Type the new password again.",
		autoComplete: "new-password",
	},
] as const;

export const ChangePasswordForm = () => {
	const navigate = useNavigate();
	const { control, handleSubmit, formState, setError } =
		useForm<ChangeOwnPasswordPayload>({
			resolver: zodResolver(PUTOwnPasswordSchema),
			defaultValues: {
				current_password: "",
				password: "",
				confirm_password: "",
			},
		});

	const mutation = useMutation({
		mutationFn: changeOwnPassword,
		onSuccess: (response) => {
			toast.success(response.message);
			void navigate({ to: "/profile", replace: true });
		},
		// The form already checked the new password, so what the server refuses is
		// the current one: say so under that field, not in a toast.
		onError: (error) => {
			// The offline banner already says why, as for every other form.
			if (!onlineManager.isOnline()) {
				return;
			}
			const message = readServerErrorMessage(error);
			if (error instanceof DetailedError && error.statusCode === 400) {
				setError("current_password", { message });
				return;
			}
			toast.error(message);
		},
	});

	return (
		<form
			className="grid gap-4"
			noValidate
			onSubmit={handleSubmit((values) => mutation.mutateAsync(values))}
		>
			{FIELDS.map((item) => (
				<Controller
					control={control}
					key={item.name}
					name={item.name}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor={`own-${item.name}`}>{item.label}</FieldLabel>
							<PasswordInput
								{...field}
								aria-invalid={fieldState.invalid}
								autoComplete={item.autoComplete}
								id={`own-${item.name}`}
							/>
							{/* The hint makes way for the error, so the button never moves. */}
							{fieldState.error ? (
								<FieldError errors={[fieldState.error]} />
							) : (
								<FieldDescription>{item.hint}</FieldDescription>
							)}
						</Field>
					)}
				/>
			))}
			<Button loading={formState.isSubmitting} type="submit">
				Change Password
			</Button>
		</form>
	);
};
