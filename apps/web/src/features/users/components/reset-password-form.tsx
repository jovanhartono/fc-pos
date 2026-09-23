import { PUTUserPasswordSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import {
	type ResetUserPasswordPayload,
	resetUserPassword,
} from "@/features/users/api";
import { PasswordInput } from "@/features/users/components/password-input";

interface ResetPasswordFormProps {
	userId: number;
	onDone: () => void;
}

export const ResetPasswordForm = ({
	userId,
	onDone,
}: ResetPasswordFormProps) => {
	const { control, handleSubmit, formState } =
		useForm<ResetUserPasswordPayload>({
			resolver: zodResolver(PUTUserPasswordSchema),
			defaultValues: { password: "", confirm_password: "" },
		});

	const resetMutation = useMutation({
		mutationKey: ["reset-user-password"],
		mutationFn: (payload: ResetUserPasswordPayload) =>
			resetUserPassword(userId, payload),
	});

	const isSubmitting = formState.isSubmitting;

	const onSubmit = async (values: ResetUserPasswordPayload) => {
		await resetMutation.mutateAsync(values);
		onDone();
	};

	return (
		<form onSubmit={handleSubmit(onSubmit)}>
			<FieldGroup>
				<Controller
					name="password"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="reset-password" asterisk>
								New password
							</FieldLabel>
							<PasswordInput
								{...field}
								id="reset-password"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="confirm_password"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="reset-confirm-password" asterisk>
								Confirm password
							</FieldLabel>
							<PasswordInput
								{...field}
								id="reset-confirm-password"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						type="button"
						variant="outline"
						onClick={onDone}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button type="submit" loading={isSubmitting}>
						Reset
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
};
