import { POSTPaymentMethodSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import {
	SHEET_FORM_GRID,
	SheetFormActions,
} from "@/components/form/sheet-form-actions";
import { SwitchList, SwitchRow } from "@/components/form/switch-list";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSheetDirtyGuard } from "@/hooks/useSheetDirtyGuard";

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
	useSheetDirtyGuard(form.formState.isDirty);

	return (
		<form onSubmit={form.handleSubmit(handleOnSubmit)}>
			<FieldGroup className={SHEET_FORM_GRID}>
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
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<SwitchList>
					<Controller
						name="is_active"
						control={form.control}
						render={({ field }) => (
							<SwitchRow
								checked={field.value}
								description="Only Active payment methods show in the POS."
								disabled={isSubmitting}
								id="payment-method-active"
								onCheckedChange={field.onChange}
								title="Active"
							/>
						)}
					/>
				</SwitchList>

				<SheetFormActions
					addLabel="Add payment method"
					isEditing={isEditing}
					isSubmitting={isSubmitting}
					onCancel={onReset}
				/>
			</FieldGroup>
		</form>
	);
}
