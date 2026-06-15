import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
	buildActiveItemMap,
	enrichProductCart,
	enrichServiceCart,
	getCartCount,
	getCartSubtotal,
	type ProductCartDisplayLine,
	type ProductCartLine,
	resetTransactionDraft,
	type ServiceCartDisplayLine,
	type ServiceCartLine,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import type { Product, Service } from "@/lib/api";
import {
	productsQueryOptions,
	servicesQueryOptions,
} from "@/lib/query-options";
import { useTransactionsPageStore } from "@/stores/transactions-store";

function createServiceCartLineId() {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`service-${Date.now()}-${Math.random()}`
	);
}

export interface CartOps {
	resetCart: () => void;
	removeProduct: (productId: number) => void;
	removeService: (lineId: string) => void;
	updateProductQty: (
		productId: number,
		nextQty: number,
		maxStock: number,
	) => void;
	updateServiceField: (
		lineId: string,
		field: "brand" | "color" | "model" | "size",
		value: string,
	) => void;
	addProduct: (product: Product) => void;
	addService: (service: Service) => void;
}

// Write ops only — reads via getValues, so consumers (e.g. the catalog) do
// not re-render on cart changes.
export function useCartOps(): CartOps {
	const form = useFormContext<TransactionDraftValues>();
	const setSubmitError = useTransactionsPageStore(
		(state) => state.setSubmitError,
	);
	const setDropoffPhoto = useTransactionsPageStore(
		(state) => state.setDropoffPhoto,
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
		resetTransactionDraft(form, { setSubmitError, setDropoffPhoto });
	}, [form, setSubmitError, setDropoffPhoto]);

	const removeProduct = useCallback(
		(productId: number) => {
			setSubmitError("");
			setProductCart(
				form.getValues("productCart").filter((line) => line.id !== productId),
			);
		},
		[form, setProductCart, setSubmitError],
	);

	const removeService = useCallback(
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

	const addProduct = useCallback(
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

	const addService = useCallback(
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
		removeProduct,
		removeService,
		updateProductQty,
		updateServiceField,
		addProduct,
		addService,
	};
}

export interface Cart extends CartOps {
	productRows: ProductCartDisplayLine[];
	serviceRows: ServiceCartDisplayLine[];
	subtotal: number;
	count: number;
}

// Ops + derived rows/totals — subscribes to cart form state and the
// product/service catalogs.
export function useCart(): Cart {
	const ops = useCartOps();

	const [
		productCart = [] as ProductCartLine[],
		serviceCart = [] as ServiceCartLine[],
	] = useWatch<TransactionDraftValues, ["productCart", "serviceCart"]>({
		name: ["productCart", "serviceCart"],
	});

	const productsQuery = useQuery(productsQueryOptions());
	const servicesQuery = useQuery(servicesQueryOptions());

	const productMap = useMemo(
		() => buildActiveItemMap(productsQuery.data ?? []),
		[productsQuery.data],
	);
	const serviceMap = useMemo(
		() => buildActiveItemMap(servicesQuery.data ?? []),
		[servicesQuery.data],
	);

	const productRows = useMemo(
		() => enrichProductCart(productCart, productMap),
		[productCart, productMap],
	);
	const serviceRows = useMemo(
		() => enrichServiceCart(serviceCart, serviceMap),
		[serviceCart, serviceMap],
	);

	const subtotal = useMemo(
		() => getCartSubtotal(productRows, serviceRows),
		[productRows, serviceRows],
	);

	const count = useMemo(
		() => getCartCount(productCart, serviceCart),
		[productCart, serviceCart],
	);

	return { ...ops, productRows, serviceRows, subtotal, count };
}
