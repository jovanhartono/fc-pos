import type { UseFormReturn } from "react-hook-form";
import { create } from "zustand";
import type {
	CatalogMode,
	CategoryFilter,
	TransactionDraftValues,
} from "@/features/transactions/lib/transactions";
import type {
	Campaign,
	Category,
	PaymentMethod,
	Product,
	Service,
	Store,
} from "@/lib/api";
import { useTransactionPreferencesStore } from "@/stores/transaction-preferences-store";

type TransactionsPageController = {
	form: UseFormReturn<TransactionDraftValues>;
	currentUserKey: string;
	submit: () => void;
};

type TransactionsPageActions = {
	setMode: (mode: CatalogMode) => void;
	setSearchTerm: (value: string) => void;
	setActiveProductCategory: (category: CategoryFilter) => void;
	setActiveServiceCategory: (category: CategoryFilter) => void;
	setSubmitError: (message: string) => void;
	handleStoreChange: (value: string) => void;
	resetCart: () => void;
	removeProductFromCart: (productId: number) => void;
	removeServiceFromCart: (lineId: string) => void;
	updateProductQty: (
		productId: number,
		nextQty: number,
		maxStock: number,
	) => void;
	updateServiceColor: (lineId: string, value: string) => void;
	updateServiceBrand: (lineId: string, value: string) => void;
	updateServiceSize: (lineId: string, value: string) => void;
	handleAddProduct: (product: Product) => void;
	handleAddService: (service: Service) => void;
	handleSubmit: () => void;
};

export type TransactionsPageData = {
	isBootstrapping: boolean;
	isAdmin: boolean;
	mode: CatalogMode;
	searchTerm: string;
	activeProductCategory: CategoryFilter;
	activeServiceCategory: CategoryFilter;
	submitError: string;
	visibleStores: Store[];
	categories: Category[];
	products: Product[];
	services: Service[];
	campaigns: Campaign[];
	paymentMethods: PaymentMethod[];
	campaignsLoading: boolean;
	paymentMethodsLoading: boolean;
	isSubmitting: boolean;
};

export type TransactionsPageStore = TransactionsPageData &
	TransactionsPageActions;

export const transactionsPageDataInitialState: TransactionsPageData = {
	isBootstrapping: true,
	isAdmin: false,
	mode: "services",
	searchTerm: "",
	activeProductCategory: "all",
	activeServiceCategory: "all",
	submitError: "",
	visibleStores: [],
	categories: [],
	products: [],
	services: [],
	campaigns: [],
	paymentMethods: [],
	campaignsLoading: false,
	paymentMethodsLoading: false,
	isSubmitting: false,
};

let transactionsPageController: TransactionsPageController | null = null;

export function bindTransactionsPageController(
	controller: TransactionsPageController,
) {
	transactionsPageController = controller;
}

export function clearTransactionsPageController() {
	transactionsPageController = null;
}

function getTransactionsPageController() {
	if (!transactionsPageController) {
		throw new Error("Transactions page controller is not initialized.");
	}

	return transactionsPageController;
}

function createServiceCartLineId() {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`service-${Date.now()}-${Math.random()}`
	);
}

function setProductCart(
	form: UseFormReturn<TransactionDraftValues>,
	nextCart: TransactionDraftValues["productCart"],
) {
	form.setValue("productCart", nextCart, {
		shouldDirty: true,
		shouldValidate: true,
	});
}

function setServiceCart(
	form: UseFormReturn<TransactionDraftValues>,
	nextCart: TransactionDraftValues["serviceCart"],
) {
	form.setValue("serviceCart", nextCart, {
		shouldDirty: true,
		shouldValidate: true,
	});
}

function getNextProductCart(
	form: UseFormReturn<TransactionDraftValues>,
	updater: (
		currentCart: TransactionDraftValues["productCart"],
	) => TransactionDraftValues["productCart"],
) {
	const currentCart = form.getValues("productCart");
	setProductCart(form, updater(currentCart));
}

function getNextServiceCart(
	form: UseFormReturn<TransactionDraftValues>,
	updater: (
		currentCart: TransactionDraftValues["serviceCart"],
	) => TransactionDraftValues["serviceCart"],
) {
	const currentCart = form.getValues("serviceCart");
	setServiceCart(form, updater(currentCart));
}

export const useTransactionsPageStore = create<TransactionsPageStore>()(
	(set) => ({
		...transactionsPageDataInitialState,
		setMode: (mode) => set({ mode }),
		setSearchTerm: (searchTerm) => set({ searchTerm }),
		setActiveProductCategory: (activeProductCategory) =>
			set({ activeProductCategory }),
		setActiveServiceCategory: (activeServiceCategory) =>
			set({ activeServiceCategory }),
		setSubmitError: (submitError) => set({ submitError }),
		handleStoreChange: (value) => {
			const { currentUserKey, form } = getTransactionsPageController();

			set({ submitError: "" });
			form.setValue("selectedStoreId", value, {
				shouldDirty: true,
				shouldValidate: true,
			});

			if (currentUserKey) {
				useTransactionPreferencesStore
					.getState()
					.setSelectedStoreId(currentUserKey, value);
			}

			form.setValue("selectedCampaignId", "", {
				shouldDirty: true,
				shouldValidate: true,
			});
		},
		resetCart: () => {
			const { form } = getTransactionsPageController();
			const selectedStoreId = form.getValues("selectedStoreId");

			set({ submitError: "" });
			form.reset({
				selectedStoreId,
				selectedCustomerId: "",
				selectedCampaignId: "",
				selectedPaymentMethodId: "",
				paymentStatus: "unpaid",
				manualDiscount: "",
				notes: "",
				productCart: [],
				serviceCart: [],
			});
		},
		removeProductFromCart: (productId) => {
			const { form } = getTransactionsPageController();

			set({ submitError: "" });
			getNextProductCart(form, (currentCart) =>
				currentCart.filter((line) => line.id !== productId),
			);
		},
		removeServiceFromCart: (lineId) => {
			const { form } = getTransactionsPageController();

			set({ submitError: "" });
			getNextServiceCart(form, (currentCart) =>
				currentCart.filter((line) => line.line_id !== lineId),
			);
		},
		updateProductQty: (productId, nextQty, maxStock) => {
			const { form } = getTransactionsPageController();

			set({ submitError: "" });
			getNextProductCart(form, (currentCart) =>
				currentCart.flatMap((line) => {
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
		updateServiceColor: (lineId, value) => {
			const { form } = getTransactionsPageController();

			set({ submitError: "" });
			getNextServiceCart(form, (currentCart) =>
				currentCart.map((line) =>
					line.line_id === lineId ? { ...line, color: value } : line,
				),
			);
		},
		updateServiceBrand: (lineId, value) => {
			const { form } = getTransactionsPageController();

			set({ submitError: "" });
			getNextServiceCart(form, (currentCart) =>
				currentCart.map((line) =>
					line.line_id === lineId ? { ...line, shoe_brand: value } : line,
				),
			);
		},
		updateServiceSize: (lineId, value) => {
			const { form } = getTransactionsPageController();

			set({ submitError: "" });
			getNextServiceCart(form, (currentCart) =>
				currentCart.map((line) =>
					line.line_id === lineId ? { ...line, shoe_size: value } : line,
				),
			);
		},
		handleAddProduct: (product) => {
			const { form } = getTransactionsPageController();
			const currentCart = form.getValues("productCart");
			const nextCart = [...currentCart];
			const lineIndex = nextCart.findIndex((line) => line.id === product.id);
			const maxStock = Number(product.stock ?? 0);

			set({ submitError: "" });

			if (lineIndex >= 0) {
				const line = nextCart[lineIndex];

				if (maxStock > 0 && line.qty >= maxStock) {
					return;
				}

				nextCart[lineIndex] = { ...line, qty: line.qty + 1 };
				setProductCart(form, nextCart);
				return;
			}

			if (maxStock <= 0) {
				return;
			}

			setProductCart(form, [
				...nextCart,
				{ kind: "product", id: product.id, qty: 1 },
			]);
		},
		handleAddService: (service) => {
			const { form } = getTransactionsPageController();

			set({ submitError: "" });
			setServiceCart(form, [
				...form.getValues("serviceCart"),
				{
					kind: "service",
					line_id: createServiceCartLineId(),
					id: service.id,
					color: "",
					shoe_brand: "",
					shoe_size: "",
				},
			]);
		},
		handleSubmit: () => {
			getTransactionsPageController().submit();
		},
	}),
);
