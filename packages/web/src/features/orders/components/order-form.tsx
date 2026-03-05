import { Plus } from "@phosphor-icons/react";
import {
	type Control,
	Controller,
	type SubmitHandler,
	type UseFormHandleSubmit,
} from "react-hook-form";
import { CurrencyInput } from "@/components/form/currency-input";
import { PhoneNumberField } from "@/components/form/phone-number-field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CustomerAutocomplete } from "@/features/orders/components/customer-autocomplete";
import { PaymentMethodAutocomplete } from "@/features/orders/components/payment-method-autocomplete";
import { ProductAutocomplete } from "@/features/orders/components/product-autocomplete";
import { ServiceAutocomplete } from "@/features/orders/components/service-autocomplete";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";

export type OrderFormState = {
	customer_name: string;
	customer_phone: string;
	customer_id: string;
	store_id: string;
	payment_method_id: string;
	payment_status: "paid" | "partial" | "unpaid";
	discount: string;
	notes: string;
	product_id: string;
	product_qty: string;
	service_id: string;
	service_qty: string;
};

type OrderFormProps = {
	control: Control<OrderFormState>;
	handleSubmit: UseFormHandleSubmit<OrderFormState>;
	onSubmit: SubmitHandler<OrderFormState>;
	isSubmitting: boolean;
};

export function OrderForm({
	control,
	handleSubmit,
	onSubmit,
	isSubmitting,
}: OrderFormProps) {
	return (
		<form
			className="grid gap-4 p-4 md:grid-cols-2"
			onSubmit={handleSubmit(onSubmit)}
		>
			<Controller
				name="customer_name"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="order-customer-name">Customer Name</FieldLabel>
						<Input
							{...field}
							id="order-customer-name"
							placeholder="e.g. John Doe"
							aria-invalid={fieldState.invalid}
							disabled={isSubmitting}
							required
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<Controller
				name="customer_phone"
				control={control}
				render={({ field, fieldState }) => (
					<PhoneNumberField
						id="order-customer-phone"
						label="Customer Phone"
						value={field.value}
						placeholder="e.g. +628123456789"
						onValueChange={field.onChange}
						disabled={isSubmitting}
						required
						error={fieldState.error}
					/>
				)}
			/>

			<Controller
				name="customer_id"
				control={control}
				render={({ field, fieldState }) => (
					<CustomerAutocomplete
						value={field.value}
						onValueChange={field.onChange}
						disabled={isSubmitting}
						required
						error={fieldState.error}
					/>
				)}
			/>

			<Controller
				name="store_id"
				control={control}
				render={({ field, fieldState }) => (
					<StoreAutocomplete
						value={field.value}
						onValueChange={field.onChange}
						disabled={isSubmitting}
						required
						error={fieldState.error}
					/>
				)}
			/>

			<Controller
				name="payment_method_id"
				control={control}
				render={({ field, fieldState }) => (
					<PaymentMethodAutocomplete
						value={field.value}
						onValueChange={field.onChange}
						disabled={isSubmitting}
						error={fieldState.error}
					/>
				)}
			/>

			<Controller
				name="payment_status"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="order-payment-status">
							Payment Status
						</FieldLabel>
						<Combobox
							id="order-payment-status"
							required
							triggerClassName="h-10 w-full text-sm"
							options={[
								{ value: "unpaid", label: "unpaid" },
								{ value: "partial", label: "partial" },
								{ value: "paid", label: "paid" },
							]}
							value={field.value}
							onValueChange={(value) =>
								field.onChange(
									(value ?? "unpaid") as OrderFormState["payment_status"],
								)
							}
							placeholder="Select payment status"
							searchPlaceholder="Search payment status..."
							emptyText="No status found"
							disabled={isSubmitting}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<Controller
				name="product_id"
				control={control}
				render={({ field, fieldState }) => (
					<ProductAutocomplete
						value={field.value}
						onValueChange={field.onChange}
						disabled={isSubmitting}
						error={fieldState.error}
					/>
				)}
			/>

			<Controller
				name="product_qty"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="order-product-qty">Product Qty</FieldLabel>
						<Input
							{...field}
							id="order-product-qty"
							type="number"
							placeholder="e.g. 1"
							min={1}
							aria-invalid={fieldState.invalid}
							disabled={isSubmitting}
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<Controller
				name="service_id"
				control={control}
				render={({ field, fieldState }) => (
					<ServiceAutocomplete
						value={field.value}
						onValueChange={field.onChange}
						disabled={isSubmitting}
						error={fieldState.error}
					/>
				)}
			/>

			<Controller
				name="service_qty"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="order-service-qty">Service Qty</FieldLabel>
						<Input
							{...field}
							id="order-service-qty"
							type="number"
							placeholder="e.g. 1"
							min={1}
							aria-invalid={fieldState.invalid}
							disabled={isSubmitting}
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<Controller
				name="discount"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="order-discount">Discount</FieldLabel>
						<CurrencyInput
							id="order-discount"
							placeholder="Rp0"
							value={field.value}
							onValueChange={field.onChange}
							disabled={isSubmitting}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<Controller
				name="notes"
				control={control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid} className="md:col-span-2">
						<FieldLabel htmlFor="order-notes">Notes</FieldLabel>
						<Input
							{...field}
							id="order-notes"
							placeholder="e.g. Customer prefers express service"
							aria-invalid={fieldState.invalid}
							disabled={isSubmitting}
							className="h-10"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			<div className="md:col-span-2 md:justify-end">
				<Button
					type="submit"
					loading={isSubmitting}
					loadingText="Creating order..."
					icon={<Plus className="size-4" weight="duotone" />}
				>
					Create Order
				</Button>
			</div>
		</form>
	);
}
