import { zodResolver } from "@hookform/resolvers/zod";
import type { UseMutationResult } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import type { CancelOrderPayload } from "@/lib/api";
import {
	type CancelFormValues,
	CancelReasonFields,
	cancelFormDefaults,
	cancelFormSchema,
} from "./cancel-reason-fields";

type CancelOrderMutation = UseMutationResult<
	unknown,
	Error,
	CancelOrderPayload,
	unknown
>;

interface CancelOrderFormProps {
	closeDialog: () => void;
	cancelOrderMutation: CancelOrderMutation;
}

export const CancelOrderForm = ({
	closeDialog,
	cancelOrderMutation,
}: CancelOrderFormProps) => {
	const form = useForm<CancelFormValues>({
		resolver: zodResolver(cancelFormSchema),
		defaultValues: cancelFormDefaults,
	});
	const isPending = cancelOrderMutation.isPending;

	const onSubmit = async (values: CancelFormValues) => {
		await cancelOrderMutation.mutateAsync({
			cancel_reason: values.cancel_reason,
			cancel_note: values.cancel_note?.trim() || undefined,
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
						{isPending ? "Cancelling…" : "Confirm Cancel Order"}
					</Button>
				</div>
			</form>
		</FormProvider>
	);
};
