import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { type Shift, shiftsKeys, updateShift } from "@/features/shifts/api";
import {
	checkClockOutAfterClockIn,
	ShiftTimeFields,
	shiftTimesSchema,
	toIso,
	toLocalInput,
} from "@/features/shifts/components/shift-time-fields";

const editShiftSchema = shiftTimesSchema.superRefine(checkClockOutAfterClockIn);

type EditShiftValues = z.infer<typeof editShiftSchema>;

interface EditShiftFormProps {
	shift: Shift;
	onDone: () => void;
}

export const EditShiftForm = ({ shift, onDone }: EditShiftFormProps) => {
	const queryClient = useQueryClient();
	const form = useForm<EditShiftValues>({
		resolver: zodResolver(editShiftSchema),
		defaultValues: {
			clock_in_at: toLocalInput(shift.clock_in_at),
			// An open Shift starts from its clock-in day, so only the hours change.
			clock_out_at: toLocalInput(shift.clock_out_at ?? shift.clock_in_at),
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-shift"],
		mutationFn: (values: EditShiftValues) =>
			updateShift(shift.id, {
				clock_in_at: toIso(values.clock_in_at),
				clock_out_at: toIso(values.clock_out_at),
			}),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: shiftsKeys.all }),
	});

	const isSubmitting = form.formState.isSubmitting;

	const onSubmit = async (values: EditShiftValues) => {
		await updateMutation.mutateAsync(values);
		onDone();
	};

	return (
		<FormProvider {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<FieldGroup>
					<ShiftTimeFields />

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
		</FormProvider>
	);
};
