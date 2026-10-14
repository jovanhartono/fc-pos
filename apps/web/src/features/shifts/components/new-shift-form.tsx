import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { createShift, shiftsKeys } from "@/features/shifts/api";
import {
	checkClockOutAfterClockIn,
	ShiftTimeFields,
	shiftTimesSchema,
	toIso,
} from "@/features/shifts/components/shift-time-fields";
import { usersQueries } from "@/features/users/api";

const newShiftSchema = shiftTimesSchema
	.extend({
		user_id: z.string().min(1, "Worker is required"),
		store_id: z.string().min(1, "Store is required"),
	})
	.superRefine(checkClockOutAfterClockIn);

type NewShiftValues = z.infer<typeof newShiftSchema>;

interface NewShiftFormProps {
	onDone: () => void;
}

export const NewShiftForm = ({ onDone }: NewShiftFormProps) => {
	const queryClient = useQueryClient();
	const usersQuery = useQuery(
		usersQueries.list({ is_active: true, limit: 100 }),
	);
	const workers = (usersQuery.data?.items ?? []).filter(
		(user) => user.role !== "admin",
	);

	const form = useForm<NewShiftValues>({
		resolver: zodResolver(newShiftSchema),
		defaultValues: {
			user_id: "",
			store_id: "",
			clock_in_at: "",
			clock_out_at: "",
		},
	});
	const userId = useWatch({ control: form.control, name: "user_id" });
	const storeIdsOf = (workerId: string) =>
		workers
			.find((worker) => String(worker.id) === workerId)
			?.userStores.map((store) => store.store_id) ?? [];
	const workerStoreIds = storeIdsOf(userId);

	const createMutation = useMutation({
		mutationKey: ["create-shift"],
		mutationFn: (values: NewShiftValues) =>
			createShift({
				user_id: Number(values.user_id),
				store_id: Number(values.store_id),
				clock_in_at: toIso(values.clock_in_at),
				clock_out_at: toIso(values.clock_out_at),
			}),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: shiftsKeys.all }),
	});

	const isSubmitting = form.formState.isSubmitting;

	const onSubmit = async (values: NewShiftValues) => {
		await createMutation.mutateAsync(values);
		onDone();
	};

	return (
		<FormProvider {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<FieldGroup>
					<Controller
						name="user_id"
						control={form.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="new-shift-worker" asterisk>
									Worker
								</FieldLabel>
								<SelectField
									id="new-shift-worker"
									className="w-full"
									disabled={isSubmitting || usersQuery.isPending}
									items={workers.map((worker) => ({
										value: String(worker.id),
										label: worker.name,
									}))}
									onValueChange={(value) => {
										field.onChange(value);
										// Most workers belong to one store, so the admin only picks when there's a choice.
										const storeIds = storeIdsOf(value);
										form.setValue(
											"store_id",
											storeIds.length === 1 ? String(storeIds[0]) : "",
										);
									}}
									placeholder="Select worker"
									value={field.value}
								/>
								<FieldError errors={[fieldState.error]} />
							</Field>
						)}
					/>

					<Controller
						name="store_id"
						control={form.control}
						render={({ field, fieldState }) => (
							<StoreAutocomplete
								id="new-shift-store"
								required
								allowedStoreIds={workerStoreIds}
								disabled={isSubmitting || !userId}
								value={field.value}
								onValueChange={field.onChange}
								error={fieldState.error}
							/>
						)}
					/>

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
