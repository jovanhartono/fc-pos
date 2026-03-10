import { POSTPaymentMethodSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export type PaymentMethodFormState = z.infer<typeof POSTPaymentMethodSchema>;

const defaultForm: PaymentMethodFormState = {
	name: "",
	code: "",
	is_active: true,
};

type PaymentMethodFormProps = {
	defaultValues?: PaymentMethodFormState;
	handleOnSubmit: (values: PaymentMethodFormState) => Promise<void> | void;
	isEditing: boolean;
	onReset: () => void;
};

export function PaymentMethodForm({
	defaultValues,
	handleOnSubmit,
	isEditing,
	onReset,
}: PaymentMethodFormProps) {
	const form = useForm({
		resolver: zodResolver(POSTPaymentMethodSchema),
		defaultValues: defaultValues ?? defaultForm,
	});
	const isSubmitting = form.formState.isSubmitting;

	return (
		<form
			className="grid gap-4 p-4 md:grid-cols-2"
			onSubmit={form.handleSubmit(handleOnSubmit)}
		>
			<Controller
				name="name"
				control={form.control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="payment-method-name" asterisk>
							Name
						</FieldLabel>
						<Input
							{...field}
							id="payment-method-name"
							placeholder="e.g. Cash"
							aria-invalid={fieldState.invalid}
							disabled={isSubmitting}
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<Controller
				name="code"
				control={form.control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="payment-method-code" asterisk>
							Code
						</FieldLabel>
						<Input
							{...field}
							id="payment-method-code"
							placeholder="e.g. CASH"
							aria-invalid={fieldState.invalid}
							disabled={isSubmitting}
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<Controller
				name="is_active"
				control={form.control}
				render={({ field }) => (
					<Field className="flex-row items-center justify-between md:col-span-2">
						<FieldLabel htmlFor="payment-method-active">Active</FieldLabel>
						<Switch
							id="payment-method-active"
							checked={field.value}
							onCheckedChange={(checked) => field.onChange(!!checked)}
							disabled={isSubmitting}
						/>
					</Field>
				)}
			/>

			<div className="flex flex-wrap gap-2 md:col-span-2 md:justify-end">
				{isEditing ? (
					<Button
						type="button"
						variant="outline"
						onClick={onReset}
						disabled={isSubmitting}
					>
						Cancel edit
					</Button>
				) : null}
				<Button
					type="submit"
					loading={isSubmitting}
					icon={<Plus className="size-4" weight="duotone" />}
				>
					{isEditing ? "Update Method" : "Create Method"}
				</Button>
			</div>
		</form>
	);
}
