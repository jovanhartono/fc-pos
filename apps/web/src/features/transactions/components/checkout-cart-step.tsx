import { XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { CustomerFields } from "@/features/transactions/components/customer-fields";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import {
	categoriesQueryOptions,
	usersPageQueryOptions,
} from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

export const CheckoutCartStep = () => {
	const {
		removeProduct,
		removeService,
		updateProductQty,
		updateServiceField,
		productRows,
		serviceRows,
	} = useCart();
	const form = useFormContext<TransactionDraftValues>();
	const categoriesQuery = useQuery(categoriesQueryOptions());
	const categoryMap = useMemo(
		() =>
			new Map(
				(categoriesQuery.data ?? []).map((category) => [category.id, category]),
			),
		[categoriesQuery.data],
	);

	const couriersQuery = useQuery(
		usersPageQueryOptions({ role: "courier", is_active: true }),
	);
	const courierOptions = useMemo<ComboboxOption[]>(
		() => [
			{ value: "none", label: "Walk-in (no courier)" },
			...(couriersQuery.data?.items ?? []).map((courier) => ({
				value: String(courier.id),
				label: courier.name,
			})),
		],
		[couriersQuery.data],
	);

	return (
		<div className="grid gap-5">
			<CustomerFields />
			<Controller
				name="selectedCourierId"
				control={form.control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-courier">
							Collected by courier
						</FieldLabel>
						<SelectField
							id="transaction-courier"
							items={courierOptions}
							value={field.value || "none"}
							onValueChange={(value) =>
								field.onChange(value === "none" ? "" : value)
							}
							placeholder="Walk-in (no courier)"
							size="lg"
							className="w-full text-sm"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<div className="grid gap-3">
				{productRows.length === 0 && serviceRows.length === 0 ? (
					<div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
						Cart is empty.
					</div>
				) : null}

				{productRows.map((line) => (
					<div
						key={`product-${line.id}`}
						className="grid gap-3 border border-border/70 p-3"
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-sm font-medium">{line.product.name}</p>
								<p className="text-xs text-muted-foreground">
									Product | {getEntityCategoryName(line.product, categoryMap)}
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="icon-xs"
								className="size-11"
								onClick={() => removeProduct(line.id)}
								icon={<XIcon className="size-4" />}
							/>
						</div>
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="icon-xs"
									className="size-11"
									onClick={() =>
										updateProductQty(
											line.id,
											line.qty - 1,
											Number(line.product.stock ?? line.qty),
										)
									}
								>
									-
								</Button>
								<div className="min-w-10 text-center text-sm font-medium">
									{line.qty}
								</div>
								<Button
									type="button"
									variant="outline"
									size="icon-xs"
									className="size-11"
									onClick={() =>
										updateProductQty(
											line.id,
											line.qty + 1,
											Number(line.product.stock ?? line.qty),
										)
									}
									disabled={line.qty >= Number(line.product.stock ?? line.qty)}
								>
									+
								</Button>
							</div>
							<p className="text-sm font-semibold">
								{formatIDRCurrency(
									String(Number(line.product.price) * line.qty),
								)}
							</p>
						</div>
					</div>
				))}

				{serviceRows.map((line, index) => (
					<div
						key={line.line_id}
						className="grid gap-3 border border-border/70 p-3"
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-sm font-medium">{line.service.name}</p>
								<p className="text-xs text-muted-foreground">
									Service | {getEntityCategoryName(line.service, categoryMap)}
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="icon-xs"
								className="size-11"
								onClick={() => removeService(line.line_id)}
								icon={<XIcon className="size-4" />}
							/>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor={`service-color-${line.line_id}`}>
									Color
								</FieldLabel>
								<Input
									id={`service-color-${line.line_id}`}
									className="h-11"
									value={line.color}
									onChange={(event) =>
										updateServiceField(
											line.line_id,
											"color",
											event.target.value,
										)
									}
									placeholder="e.g. Black"
								/>
							</Field>
							<Field
								data-invalid={
									!!form.formState.errors.serviceCart?.[index]?.brand
								}
							>
								<FieldLabel htmlFor={`service-brand-${line.line_id}`}>
									Brand
								</FieldLabel>
								<Input
									id={`service-brand-${line.line_id}`}
									className="h-11"
									value={line.brand}
									onChange={(event) =>
										updateServiceField(
											line.line_id,
											"brand",
											event.target.value,
										)
									}
									placeholder="e.g. Adidas"
								/>
								<FieldError
									errors={[form.formState.errors.serviceCart?.[index]?.brand]}
								/>
							</Field>
							<Field
								data-invalid={
									!!form.formState.errors.serviceCart?.[index]?.model
								}
							>
								<FieldLabel htmlFor={`service-model-${line.line_id}`}>
									Model
								</FieldLabel>
								<Input
									id={`service-model-${line.line_id}`}
									className="h-11"
									value={line.model}
									onChange={(event) =>
										updateServiceField(
											line.line_id,
											"model",
											event.target.value,
										)
									}
									placeholder="e.g. Yeezy"
								/>
								<FieldError
									errors={[form.formState.errors.serviceCart?.[index]?.model]}
								/>
							</Field>
							<Field
								data-invalid={
									!!form.formState.errors.serviceCart?.[index]?.size
								}
							>
								<FieldLabel htmlFor={`service-size-${line.line_id}`}>
									Size
								</FieldLabel>
								<Input
									id={`service-size-${line.line_id}`}
									className="h-11"
									value={line.size}
									onChange={(event) =>
										updateServiceField(line.line_id, "size", event.target.value)
									}
									placeholder="e.g. 42"
								/>
								<FieldError
									errors={[form.formState.errors.serviceCart?.[index]?.size]}
								/>
							</Field>
						</div>
						<div className="flex items-center justify-end gap-3">
							<p className="text-sm font-semibold">
								{formatIDRCurrency(String(line.service.price))}
							</p>
						</div>
					</div>
				))}
			</div>

			<Controller
				name="notes"
				control={form.control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-notes">Notes</FieldLabel>
						<Textarea
							id="transaction-notes"
							value={field.value}
							onChange={field.onChange}
							placeholder="Add notes"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</div>
	);
};
