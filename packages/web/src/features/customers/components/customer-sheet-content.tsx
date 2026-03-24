import { POSTCustomerSchema } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import {
	CustomerForm,
	type CustomerFormState,
} from "@/features/customers/components/customer-form";
import {
	type Customer,
	createCustomer,
	queryKeys,
	updateCustomer,
} from "@/lib/api";
import { normalizePhoneNumber } from "@/lib/phone-number";
import { useSheet } from "@/stores/sheet-store";

const defaultForm: CustomerFormState = {
	name: "",
	phone_number: "",
	email: "",
	address: "",
	origin_store_id: undefined,
};

const customerFormResolverSchema = POSTCustomerSchema.omit({
	origin_store_id: true,
}).extend({
	email: z.union([z.literal(""), z.email("Invalid email address")]),
	address: z.string(),
	origin_store_id: z.number().int().optional(),
});

export type CustomerSheetContentProps = {
	editingCustomer?: Customer;
	onSuccess?: (customer: { id: number }) => void;
};

export function CustomerSheetContent({
	editingCustomer,
	onSuccess,
}: CustomerSheetContentProps) {
	const queryClient = useQueryClient();
	const { closeSheet } = useSheet();

	const form = useForm<CustomerFormState>({
		resolver: zodResolver(customerFormResolverSchema),
		defaultValues: editingCustomer
			? {
					name: editingCustomer.name,
					phone_number: editingCustomer.phone_number,
					email: editingCustomer.email ?? "",
					address: editingCustomer.address ?? "",
					origin_store_id: editingCustomer.origin_store_id,
				}
			: defaultForm,
	});

	const createMutation = useMutation({
		mutationKey: ["create-customer"],
		mutationFn: createCustomer,
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({ queryKey: ["customers"] });
			await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
			if (onSuccess) {
				onSuccess(data.data);
			}
			closeSheet();
		},
	});

	const updateMutation = useMutation({
		mutationKey: ["update-customer"],
		mutationFn: ({
			id,
			payload,
		}: {
			id: number;
			payload: Parameters<typeof updateCustomer>[1];
		}) => updateCustomer(id, payload),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({ queryKey: ["customers"] });
			if (onSuccess) {
				onSuccess(data.data);
			}
			closeSheet();
		},
	});

	const isSubmitting = createMutation.isPending || updateMutation.isPending;
	const isEditing = !!editingCustomer;

	const handleSubmit: SubmitHandler<CustomerFormState> = async (values) => {
		const normalizedPhoneNumber = normalizePhoneNumber(values.phone_number);

		if (isEditing && editingCustomer) {
			const payload: Parameters<typeof updateCustomer>[1] = {
				name: values.name,
				phone_number: normalizedPhoneNumber,
				email: values.email?.length ? values.email : undefined,
				address: values.address ?? "",
			};

			await updateMutation.mutateAsync({
				id: editingCustomer.id,
				payload,
			});
			return;
		}

		const payload: Parameters<typeof createCustomer>[0] = {
			name: values.name,
			phone_number: normalizedPhoneNumber,
			email: values.email?.length ? values.email : undefined,
			address: values.address ?? "",
			...(values.origin_store_id
				? { origin_store_id: values.origin_store_id }
				: {}),
		};

		await createMutation.mutateAsync(payload);
	};

	return (
		<CustomerForm
			control={form.control}
			handleSubmit={form.handleSubmit}
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			isEditing={isEditing}
			onReset={closeSheet}
		/>
	);
}
