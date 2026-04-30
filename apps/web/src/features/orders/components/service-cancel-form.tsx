import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	type CancelFormValues,
	CancelReasonFields,
	cancelFormDefaults,
	cancelFormSchema,
} from "./cancel-reason-fields";
import type { UpdateStatusMutation } from "./order-service-dialog.types";

interface ServiceCancelFormProps {
	serviceId: number;
	updateStatusMutation: UpdateStatusMutation;
	closeDialog: () => void;
}

export const ServiceCancelForm = ({
	serviceId,
	updateStatusMutation,
	closeDialog,
}: ServiceCancelFormProps) => {
	const form = useForm<CancelFormValues>({
		resolver: zodResolver(cancelFormSchema),
		defaultValues: cancelFormDefaults,
	});
	const isPending = updateStatusMutation.isPending;

	const onSubmit = async (values: CancelFormValues) => {
		await updateStatusMutation.mutateAsync({
			serviceId,
			payload: {
				status: "cancelled",
				cancel_reason: values.cancel_reason,
				cancel_note: values.cancel_note?.trim() || undefined,
			},
		});
		closeDialog();
	};

	return (
		<FormProvider {...form}>
			<form
				className="flex flex-col gap-4"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<CancelReasonFields disabled={isPending} />

				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						type="button"
						variant="outline"
						onClick={closeDialog}
						disabled={isPending}
					>
						Go back
					</Button>
					<Button type="submit" variant="destructive" disabled={isPending}>
						{isPending ? "Saving…" : "Confirm Cancel"}
					</Button>
				</div>
			</form>
		</FormProvider>
	);
};
