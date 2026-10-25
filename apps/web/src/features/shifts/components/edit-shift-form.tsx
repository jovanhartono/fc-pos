import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { StoreSelect } from "@/features/orders/components/store-select";
import { type Shift, shiftsKeys, updateShift } from "@/features/shifts/api";
import {
	checkClockOutAfterClockIn,
	ShiftTimeFields,
	shiftTimesSchema,
	toIso,
	toLocalInput,
} from "@/features/shifts/components/shift-time-fields";
import { usersQueries } from "@/features/users/api";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";
import { REFERENCE_DATA_STALE_TIME } from "@/lib/query-defaults";

const shiftFieldsSchema = shiftTimesSchema.extend({
	store_id: z.string().min(1, "Store is required"),
});

const editShiftSchema = shiftFieldsSchema.superRefine(
	checkClockOutAfterClockIn,
);

const editOnShiftSchema = shiftFieldsSchema
	.extend({ clock_out_at: z.string() })
	.superRefine(checkClockOutAfterClockIn);

type EditShiftValues = z.infer<typeof editShiftSchema>;

interface EditShiftFormProps {
	shift: Shift;
	onDone: () => void;
}

export const EditShiftForm = ({ shift, onDone }: EditShiftFormProps) => {
	const queryClient = useQueryClient();
	// Open from an earlier day is waiting for the midnight close, not on shift.
	const isOnShift =
		shift.clock_out_at === null &&
		dayjs(shift.clock_in_at)
			.tz(JAKARTA_TZ)
			.isSame(dayjs().tz(JAKARTA_TZ), "day");
	const usersQuery = useQuery({
		...usersQueries.list({ is_active: true, limit: 100 }),
		staleTime: REFERENCE_DATA_STALE_TIME,
	});
	const workerStoreIds =
		usersQuery.data?.items
			.find((user) => user.id === shift.user_id)
			?.userStores.map((store) => store.store_id) ?? [];

	const form = useForm<EditShiftValues>({
		resolver: zodResolver(isOnShift ? editOnShiftSchema : editShiftSchema),
		defaultValues: {
			clock_in_at: toLocalInput(shift.clock_in_at),
			// Left open on an earlier day: start from its clock-in day, so only the hours change.
			clock_out_at: isOnShift
				? ""
				: toLocalInput(shift.clock_out_at ?? shift.clock_in_at),
			store_id: String(shift.store_id),
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-shift"],
		mutationFn: (values: EditShiftValues) =>
			updateShift(shift.id, {
				clock_in_at: toIso(values.clock_in_at),
				clock_out_at: values.clock_out_at
					? toIso(values.clock_out_at)
					: undefined,
				store_id: Number(values.store_id),
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
					<Controller
						name="store_id"
						control={form.control}
						render={({ field, fieldState }) => (
							<StoreSelect
								id="edit-shift-store"
								required
								// A worker since let go keeps the Store they worked at.
								allowedStoreIds={[...workerStoreIds, shift.store_id]}
								disabled={isSubmitting}
								value={field.value}
								onValueChange={field.onChange}
								error={fieldState.error}
							/>
						)}
					/>

					<ShiftTimeFields isOnShift={isOnShift} />

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
