import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { OrderCancelReason } from "@/lib/api";
import { CANCEL_REASONS, formatCancelReason } from "@/lib/status";

export const cancelFormSchema = z
	.object({
		cancel_reason: z.enum(CANCEL_REASONS),
		cancel_note: z.string().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.cancel_reason === "other" && !(value.cancel_note ?? "").trim()) {
			ctx.addIssue({
				code: "custom",
				message: "Cancel note is required when reason is Other.",
				path: ["cancel_note"],
			});
		}
	});

export type CancelFormValues = z.infer<typeof cancelFormSchema>;

export const cancelFormDefaults: CancelFormValues = {
	cancel_reason: "customer_request",
	cancel_note: "",
};

interface CancelReasonFieldsProps {
	disabled?: boolean;
}

export const CancelReasonFields = ({ disabled }: CancelReasonFieldsProps) => {
	const { control, register, formState } = useFormContext<CancelFormValues>();
	const reasonId = useId();
	const noteId = useId();
	const noteError = formState.errors.cancel_note;

	return (
		<>
			<Controller
				control={control}
				name="cancel_reason"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
						<Select
							value={field.value}
							onValueChange={(value) =>
								field.onChange(value as OrderCancelReason)
							}
							disabled={disabled}
						>
							<SelectTrigger id={reasonId} className="w-full">
								<SelectValue placeholder="Select reason">
									{field.value ? formatCancelReason(field.value) : undefined}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{CANCEL_REASONS.map((reason) => (
									<SelectItem key={reason} value={reason}>
										{formatCancelReason(reason)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<Field data-invalid={Boolean(noteError)}>
				<FieldLabel htmlFor={noteId}>Note (required for Other)</FieldLabel>
				<Textarea
					id={noteId}
					placeholder="Cancel note"
					disabled={disabled}
					aria-invalid={Boolean(noteError)}
					{...register("cancel_note")}
				/>
				<FieldError errors={[noteError]} />
			</Field>
		</>
	);
};
