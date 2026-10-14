import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type Shift, shiftsKeys, updateShift } from "@/features/shifts/api";

// datetime-local's own format, in the phone's time.
const LOCAL_FORMAT = "YYYY-MM-DDTHH:mm";

const editShiftSchema = z
	.object({
		clock_in_at: z.string().min(1, "Clock in is required"),
		clock_out_at: z.string().min(1, "Clock out is required"),
	})
	.refine((values) => values.clock_out_at > values.clock_in_at, {
		message: "Clock out must be after clock in",
		path: ["clock_out_at"],
	});

type EditShiftValues = z.infer<typeof editShiftSchema>;

interface EditShiftFormProps {
	shift: Shift;
	onDone: () => void;
}

export const EditShiftForm = ({ shift, onDone }: EditShiftFormProps) => {
	const queryClient = useQueryClient();
	const { control, handleSubmit, formState } = useForm<EditShiftValues>({
		resolver: zodResolver(editShiftSchema),
		defaultValues: {
			clock_in_at: dayjs(shift.clock_in_at).format(LOCAL_FORMAT),
			clock_out_at: shift.clock_out_at
				? dayjs(shift.clock_out_at).format(LOCAL_FORMAT)
				: "",
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-shift"],
		mutationFn: (values: EditShiftValues) =>
			updateShift(shift.id, {
				clock_in_at: dayjs(values.clock_in_at).toISOString(),
				clock_out_at: dayjs(values.clock_out_at).toISOString(),
			}),
		// Replaces the global success toast (main.tsx), so it shows the message itself.
		onSuccess: (response) => {
			toast.success(response.message);
			void queryClient.invalidateQueries({ queryKey: shiftsKeys.all });
		},
	});

	const isSubmitting = formState.isSubmitting;

	const onSubmit = async (values: EditShiftValues) => {
		await updateMutation.mutateAsync(values);
		onDone();
	};

	return (
		<form onSubmit={handleSubmit(onSubmit)}>
			<FieldGroup>
				<Controller
					name="clock_in_at"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="edit-shift-clock-in" asterisk>
								Clock in
							</FieldLabel>
							<Input
								{...field}
								id="edit-shift-clock-in"
								type="datetime-local"
								aria-invalid={fieldState.invalid}
								disabled={isSubmitting}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>

				<Controller
					name="clock_out_at"
					control={control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="edit-shift-clock-out" asterisk>
								Clock out
							</FieldLabel>
							<Input
								{...field}
								id="edit-shift-clock-out"
								type="datetime-local"
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
						Save
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
};
