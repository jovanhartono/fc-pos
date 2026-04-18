import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import type {
	ProductCartLine,
	ServiceCartLine,
	TransactionDraftValues,
} from "@/features/transactions/lib/transactions";
import type { Product, Service } from "@/lib/api";
import { useTransactionsPageStore } from "@/stores/transactions-store";

function createServiceCartLineId() {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`service-${Date.now()}-${Math.random()}`
	);
}

export function useTransactionsCart() {
	const form = useFormContext<TransactionDraftValues>();
	const setSubmitError = useTransactionsPageStore(
		(state) => state.setSubmitError,
	);

	const setProductCart = useCallback(
		(nextCart: ProductCartLine[]) => {
			form.setValue("productCart", nextCart, {
				shouldDirty: true,
				shouldValidate: true,
			});
		},
		[form],
	);

	const setServiceCart = useCallback(
		(nextCart: ServiceCartLine[]) => {
			form.setValue("serviceCart", nextCart, {
				shouldDirty: true,
				shouldValidate: true,
			});
		},
		[form],
	);

	const resetCart = useCallback(() => {
		const selectedStoreId = form.getValues("selectedStoreId");
		setSubmitError("");
		form.reset({
			selectedStoreId,
			selectedCustomerId: "",
			selectedCampaignIds: [],
			selectedPaymentMethodId: "",
			paymentStatus: "unpaid",
			manualDiscount: "",
			notes: "",
			productCart: [],
			serviceCart: [],
		});
	}, [form, setSubmitError]);

	const removeProductFromCart = useCallback(
		(productId: number) => {
			setSubmitError("");
			setProductCart(
				form.getValues("productCart").filter((line) => line.id !== productId),
			);
		},
		[form, setProductCart, setSubmitError],
	);

	const removeServiceFromCart = useCallback(
		(lineId: string) => {
			setSubmitError("");
			setServiceCart(
				form.getValues("serviceCart").filter((line) => line.line_id !== lineId),
			);
		},
		[form, setServiceCart, setSubmitError],
	);

	const updateProductQty = useCallback(
		(productId: number, nextQty: number, maxStock: number) => {
			setSubmitError("");
			setProductCart(
				form.getValues("productCart").flatMap((line) => {
					if (line.id !== productId) {
						return [line];
					}
					if (nextQty <= 0) {
						return [];
					}
					return [
						{
							...line,
							qty: maxStock > 0 ? Math.min(nextQty, maxStock) : nextQty,
						},
					];
				}),
			);
		},
		[form, setProductCart, setSubmitError],
	);

	const updateServiceField = useCallback(
		(
			lineId: string,
			field: "brand" | "color" | "model" | "size",
			value: string,
		) => {
			setSubmitError("");
			setServiceCart(
				form
					.getValues("serviceCart")
					.map((line) =>
						line.line_id === lineId ? { ...line, [field]: value } : line,
					),
			);
		},
		[form, setServiceCart, setSubmitError],
	);

	const handleAddProduct = useCallback(
		(product: Product) => {
			const currentCart = form.getValues("productCart");
			const maxStock = Number(product.stock ?? 0);
			const lineIndex = currentCart.findIndex((line) => line.id === product.id);

			setSubmitError("");

			if (lineIndex >= 0) {
				const line = currentCart[lineIndex];
				if (maxStock > 0 && line.qty >= maxStock) {
					return;
				}
				const nextCart = [...currentCart];
				nextCart[lineIndex] = { ...line, qty: line.qty + 1 };
				setProductCart(nextCart);
				return;
			}

			if (maxStock <= 0) {
				return;
			}

			setProductCart([
				...currentCart,
				{ kind: "product", id: product.id, qty: 1 },
			]);
		},
		[form, setProductCart, setSubmitError],
	);

	const handleAddService = useCallback(
		(service: Service) => {
			setSubmitError("");
			setServiceCart([
				...form.getValues("serviceCart"),
				{
					kind: "service",
					line_id: createServiceCartLineId(),
					id: service.id,
					brand: "",
					color: "",
					model: "",
					size: "",
				},
			]);
		},
		[form, setServiceCart, setSubmitError],
	);

	return {
		resetCart,
		removeProductFromCart,
		removeServiceFromCart,
		updateProductQty,
		updateServiceField,
		handleAddProduct,
		handleAddService,
	};
}
