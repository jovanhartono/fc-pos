import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
	buildActiveItemMap,
	createCartLineId,
	createEmptyItem,
	enrichItemCart,
	enrichProductCart,
	getCartCount,
	getCartSubtotal,
	type ItemCartDisplayLine,
	type ItemCartLine,
	moveCartService,
	type ProductCartDisplayLine,
	type ProductCartLine,
	resetTransactionDraft,
	resolveActiveItemId,
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

export interface CartOps {
	resetCart: () => void;
	removeProduct: (productId: number) => void;
	removeItem: (itemId: string) => void;
	removeService: (itemId: string, lineId: string) => void;
	updateProductQty: (
		productId: number,
		nextQty: number,
		maxStock: number,
	) => void;
	updateItemField: (
		itemId: string,
		field: "brand" | "color" | "model" | "size",
		value: string,
	) => void;
	updateServiceField: (
		itemId: string,
		lineId: string,
		field: "notes" | "price",
		value: string,
	) => void;
	moveService: (
		fromItemId: string,
		lineId: string,
		toItemId: string | null,
	) => void;
	addProduct: (product: Product) => void;
	addService: (service: Service) => void;
	addItem: () => void;
	setActiveItem: (itemId: string) => void;
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

	const setItemCart = useCallback(
		(nextCart: ItemCartLine[]) => {
			form.setValue("itemCart", nextCart, {
				shouldDirty: true,
				shouldValidate: true,
			});
		},
		[form],
	);

	// Which card a catalog tap lands on. Transient counter state, so it lives
	// beside the drop-off photo rather than in the draft the server sees. Only
	// the setter is subscribed to: reading the value here would re-render every
	// consumer of this hook — including the whole catalog grid — on each tap.
	const setActiveItemId = useTransactionsPageStore(
		(state) => state.setActiveItemId,
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

	// Every write goes through here, so the "one item is active" pointer is
	// reconciled here too rather than re-remembered at each call site.
	const patchItem = useCallback(
		(itemId: string, patch: (item: ItemCartLine) => ItemCartLine) => {
			setSubmitError("");
			setItemCart(
				form
					.getValues("itemCart")
					.map((item) => (item.line_id === itemId ? patch(item) : item)),
			);
		},
		[form, setItemCart, setSubmitError],
	);

	const removeItem = useCallback(
		(itemId: string) => {
			setSubmitError("");
			setItemCart(
				form.getValues("itemCart").filter((item) => item.line_id !== itemId),
			);
		},
		[form, setItemCart, setSubmitError],
	);

	// Pulling the last treatment off an object leaves the card standing and
	// empty on purpose: the cashier is mid-correction, and silently deleting the
	// descriptors they just typed would be the wrong kind of tidy. It is dropped
	// on the way to the wire instead.
	const removeService = useCallback(
		(itemId: string, lineId: string) => {
			patchItem(itemId, (item) => ({
				...item,
				services: item.services.filter((line) => line.line_id !== lineId),
			}));
		},
		[patchItem],
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

	const updateItemField = useCallback(
		(
			itemId: string,
			field: "brand" | "color" | "model" | "size",
			value: string,
		) => {
			patchItem(itemId, (item) => ({ ...item, [field]: value }));
		},
		[patchItem],
	);

	const updateServiceField = useCallback(
		(
			itemId: string,
			lineId: string,
			field: "notes" | "price",
			value: string,
		) => {
			patchItem(itemId, (item) => ({
				...item,
				services: item.services.map((line) =>
					line.line_id === lineId ? { ...line, [field]: value } : line,
				),
			}));
		},
		[patchItem],
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

	const moveService = useCallback(
		(fromItemId: string, lineId: string, toItemId: string | null) => {
			const moved = moveCartService(
				form.getValues("itemCart"),
				fromItemId,
				lineId,
				toItemId,
			);
			if (!moved) {
				return;
			}
			setSubmitError("");
			setItemCart(moved.cart);
			// A split opens a card the same way "+ Item" does, so the next catalog
			// tap lands on it the same way too.
			if (moved.createdItemId) {
				setActiveItemId(moved.createdItemId);
			}
		},
		[form, setItemCart, setSubmitError, setActiveItemId],
	);

	const addItem = useCallback(() => {
		setSubmitError("");
		const item = createEmptyItem();
		setItemCart([...form.getValues("itemCart"), item]);
		setActiveItemId(item.line_id);
	}, [form, setItemCart, setSubmitError, setActiveItemId]);

	// A catalog tap lands on the object already on the counter — that is the
	// upsell, and it is the common case. The first tap of an order has no card
	// to land on, so it opens one: a single-object order costs the cashier
	// exactly the taps it always did (ADR-0017).
	const addService = useCallback(
		(service: Service) => {
			setSubmitError("");
			const cart = form.getValues("itemCart");
			const treatment: ServiceCartLine = {
				kind: "service",
				line_id: createCartLineId("service"),
				id: service.id,
				notes: "",
				price: "",
			};

			// Read the pointer, don't subscribe to it — and resolve it against the
			// cart, so a pointer at a card the cashier just removed lands on one
			// still on the counter instead of opening a stray third card.
			const activeId = resolveActiveItemId(
				cart,
				useTransactionsPageStore.getState().activeItemId,
			);
			const target = cart.find((item) => item.line_id === activeId);
			if (!target) {
				const item = createEmptyItem();
				setItemCart([...cart, { ...item, services: [treatment] }]);
				setActiveItemId(item.line_id);
				return;
			}

			patchItem(target.line_id, (item) => ({
				...item,
				services: [...item.services, treatment],
			}));
		},
		[form, patchItem, setItemCart, setSubmitError, setActiveItemId],
	);

	return {
		resetCart,
		removeProduct,
		removeItem,
		removeService,
		updateProductQty,
		updateItemField,
		updateServiceField,
		moveService,
		addProduct,
		addService,
		addItem,
		setActiveItem: setActiveItemId,
	};
}

export interface Cart extends CartOps {
	productRows: ProductCartDisplayLine[];
	itemRows: ItemCartDisplayLine[];
	// Every treatment across every object, for the money maths and the
	// unpriced-line checks that are genuinely per-treatment.
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
		itemCart = [] as ItemCartLine[],
	] = useWatch<TransactionDraftValues, ["productCart", "itemCart"]>({
		name: ["productCart", "itemCart"],
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
	const itemRows = useMemo(
		() => enrichItemCart(itemCart, serviceMap),
		[itemCart, serviceMap],
	);

	const serviceRows = useMemo(
		() => itemRows.flatMap((item) => item.services),
		[itemRows],
	);

	const subtotal = useMemo(
		() => getCartSubtotal(productRows, serviceRows),
		[productRows, serviceRows],
	);

	const count = useMemo(
		() => getCartCount(productCart, itemCart),
		[productCart, itemCart],
	);

	return { ...ops, productRows, itemRows, serviceRows, subtotal, count };
}
