import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { handleCreatedOrderSuccess } from "@/features/orders/lib/create-order-workflow";
import {
	buildCategoryTabs,
	getCampaignDiscount,
	getEntityCategoryName,
	isCampaignAvailable,
	type ProductCartDisplayLine,
	type ServiceCartDisplayLine,
	type TransactionDraftValues,
	toTransactionPayload,
} from "@/features/transactions/lib/transactions";
import {
	createOrder,
	type PaymentMethod,
	type Product,
	type Service,
	type Store,
} from "@/lib/api";
import {
	campaignsQueryOptions,
	categoriesQueryOptions,
	currentUserDetailQueryOptions,
	paymentMethodsQueryOptions,
	productsQueryOptions,
	servicesQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import { getCurrentUser } from "@/stores/auth-store";
import { useTransactionPreferencesStore } from "@/stores/transaction-preferences-store";

const defaultDraftValues: TransactionDraftValues = {
	selectedStoreId: "",
	selectedCustomerId: "",
	selectedCampaignId: "",
	selectedPaymentMethodId: "",
	paymentStatus: "unpaid",
	manualDiscount: "",
	notes: "",
	productCart: [],
	serviceCart: [],
};

function createServiceCartLineId() {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`service-${Date.now()}-${Math.random()}`
	);
}

const transactionDraftSchema = z
	.object({
		selectedStoreId: z
			.string()
			.trim()
			.min(1, "Store is required before creating a transaction."),
		selectedCustomerId: z
			.string()
			.trim()
			.min(1, "Customer reference is required."),
		selectedCampaignId: z.string(),
		selectedPaymentMethodId: z.string(),
		paymentStatus: z.enum(["paid", "unpaid"]),
		manualDiscount: z
			.string()
			.refine(
				(value) => value.trim() === "" || Number(value) >= 0,
				"Discount cannot be negative",
			),
		notes: z.string(),
		productCart: z.array(
			z.object({
				kind: z.literal("product"),
				id: z.number(),
				qty: z.number().int().positive(),
			}),
		),
		serviceCart: z.array(
			z.object({
				kind: z.literal("service"),
				line_id: z.string(),
				id: z.number(),
				color: z.string(),
				shoe_brand: z.string(),
				shoe_size: z.string(),
			}),
		),
	})
	.superRefine((values, ctx) => {
		if (values.productCart.length === 0 && values.serviceCart.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["productCart"],
				message: "Add at least one product or service to the cart.",
			});
		}

		if (values.paymentStatus === "paid" && !values.selectedPaymentMethodId) {
			ctx.addIssue({
				code: "custom",
				path: ["selectedPaymentMethodId"],
				message: "Payment method is required for paid orders.",
			});
		}

		if (Number(values.manualDiscount || 0) > 0 && values.selectedCampaignId) {
			ctx.addIssue({
				code: "custom",
				path: ["selectedCampaignId"],
				message: "Campaign discount cannot be combined with manual discount.",
			});
		}
	});

function findOptionLabel(
	options: Array<{ value: string; label: string }>,
	value: string,
) {
	return options.find((option) => option.value === value)?.label;
}

export function useTransactionsPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const currentUser = getCurrentUser();
	const currentUserKey = currentUser ? String(currentUser.id) : "";
	const persistedSelectedStoreId = useTransactionPreferencesStore((state) =>
		currentUserKey ? (state.selectedStoreIdByUser[currentUserKey] ?? "") : "",
	);
	const setPersistedSelectedStoreId = useTransactionPreferencesStore(
		(state) => state.setSelectedStoreId,
	);
	const clearPersistedSelectedStoreId = useTransactionPreferencesStore(
		(state) => state.clearSelectedStoreId,
	);
	const [mode, setMode] = useState<"products" | "services">("services");
	const [searchTerm, setSearchTerm] = useState("");
	const [activeProductCategory, setActiveProductCategory] = useState<
		"all" | number
	>("all");
	const [activeServiceCategory, setActiveServiceCategory] = useState<
		"all" | number
	>("all");
	const [submitError, setSubmitError] = useState("");
	const deferredSearchTerm = useDeferredValue(searchTerm);

	const form = useForm<TransactionDraftValues>({
		resolver: zodResolver(transactionDraftSchema),
		defaultValues: defaultDraftValues,
	});

	const selectedStoreId =
		useWatch({
			control: form.control,
			name: "selectedStoreId",
		}) ?? "";
	const selectedCustomerId =
		useWatch({
			control: form.control,
			name: "selectedCustomerId",
		}) ?? "";
	const selectedCampaignId =
		useWatch({
			control: form.control,
			name: "selectedCampaignId",
		}) ?? "";
	const selectedPaymentMethodId =
		useWatch({
			control: form.control,
			name: "selectedPaymentMethodId",
		}) ?? "";
	const paymentStatus =
		useWatch({
			control: form.control,
			name: "paymentStatus",
		}) ?? "unpaid";
	const manualDiscount =
		useWatch({
			control: form.control,
			name: "manualDiscount",
		}) ?? "";
	const notes =
		useWatch({
			control: form.control,
			name: "notes",
		}) ?? "";
	const productCart =
		useWatch({
			control: form.control,
			name: "productCart",
		}) ?? [];
	const serviceCart =
		useWatch({
			control: form.control,
			name: "serviceCart",
		}) ?? [];

	const storesQuery = useQuery(storesQueryOptions());
	const categoriesQuery = useQuery(categoriesQueryOptions());
	const productsQuery = useQuery(productsQueryOptions());
	const servicesQuery = useQuery(servicesQueryOptions());
	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());
	const currentUserDetailQuery = useQuery({
		...currentUserDetailQueryOptions(currentUser?.id ?? -1),
		enabled: !!currentUser,
	});

	const userStoreIds =
		currentUserDetailQuery.data?.userStores?.map((item) => item.store_id) ?? [];

	const visibleStores = useMemo(() => {
		const stores = storesQuery.data ?? [];

		if (currentUser?.role === "admin") {
			return stores;
		}

		return stores.filter((store) => userStoreIds.includes(store.id));
	}, [currentUser?.role, storesQuery.data, userStoreIds]);

	useEffect(() => {
		const canResolveStoreSelection =
			storesQuery.isSuccess &&
			(currentUser?.role === "admin" || currentUserDetailQuery.isSuccess);

		if (!canResolveStoreSelection || !currentUserKey) {
			return;
		}

		const hasPersistedVisibleStore =
			persistedSelectedStoreId.length > 0 &&
			visibleStores.some(
				(store) => String(store.id) === persistedSelectedStoreId,
			);
		const fallbackStoreId =
			currentUser?.role === "admin" ? "" : String(visibleStores[0]?.id ?? "");
		const nextStoreId = hasPersistedVisibleStore
			? persistedSelectedStoreId
			: fallbackStoreId;

		if (selectedStoreId !== nextStoreId) {
			form.setValue("selectedStoreId", nextStoreId, {
				shouldDirty: false,
			});
		}

		if (nextStoreId) {
			if (persistedSelectedStoreId !== nextStoreId) {
				setPersistedSelectedStoreId(currentUserKey, nextStoreId);
			}
			return;
		}

		if (persistedSelectedStoreId) {
			clearPersistedSelectedStoreId(currentUserKey);
		}
	}, [
		clearPersistedSelectedStoreId,
		currentUser?.role,
		currentUserDetailQuery.isSuccess,
		currentUserKey,
		form,
		persistedSelectedStoreId,
		selectedStoreId,
		setPersistedSelectedStoreId,
		storesQuery.isSuccess,
		visibleStores,
	]);

	const selectedStoreNumber =
		selectedStoreId && Number.isFinite(Number(selectedStoreId))
			? Number(selectedStoreId)
			: undefined;

	const campaignsQuery = useQuery({
		...campaignsQueryOptions({
			store_id: selectedStoreNumber,
			is_active: true,
		}),
		enabled: selectedStoreNumber !== undefined,
	});

	const isBootstrapping =
		storesQuery.isPending ||
		categoriesQuery.isPending ||
		productsQuery.isPending ||
		servicesQuery.isPending ||
		paymentMethodsQuery.isPending ||
		currentUserDetailQuery.isPending;

	const categoryMap = useMemo(
		() =>
			new Map(
				(categoriesQuery.data ?? []).map((category) => [category.id, category]),
			),
		[categoriesQuery.data],
	);

	const products = useMemo(
		() => (productsQuery.data ?? []).filter((product) => product.is_active),
		[productsQuery.data],
	);
	const services = useMemo(
		() => (servicesQuery.data ?? []).filter((service) => service.is_active),
		[servicesQuery.data],
	);
	const productMap = useMemo(
		() => new Map(products.map((product) => [product.id, product])),
		[products],
	);
	const serviceMap = useMemo(
		() => new Map(services.map((service) => [service.id, service])),
		[services],
	);

	const searchValue = deferredSearchTerm.trim().toLowerCase();
	const productTabs = useMemo(
		() => buildCategoryTabs({ items: products, categoryMap }),
		[categoryMap, products],
	);
	const serviceTabs = useMemo(
		() => buildCategoryTabs({ items: services, categoryMap }),
		[categoryMap, services],
	);

	const filteredProducts = useMemo(
		() =>
			products.filter((product) => {
				const categoryName = getEntityCategoryName(
					product,
					categoryMap,
				).toLowerCase();
				const matchesCategory =
					activeProductCategory === "all" ||
					product.category_id === activeProductCategory;
				const matchesSearch =
					searchValue.length === 0 ||
					product.name.toLowerCase().includes(searchValue) ||
					(product.description ?? "").toLowerCase().includes(searchValue) ||
					categoryName.includes(searchValue);

				return matchesCategory && matchesSearch;
			}),
		[activeProductCategory, categoryMap, products, searchValue],
	);
	const filteredServices = useMemo(
		() =>
			services.filter((service) => {
				const categoryName = getEntityCategoryName(
					service,
					categoryMap,
				).toLowerCase();
				const matchesCategory =
					activeServiceCategory === "all" ||
					service.category_id === activeServiceCategory;
				const matchesSearch =
					searchValue.length === 0 ||
					service.name.toLowerCase().includes(searchValue) ||
					(service.description ?? "").toLowerCase().includes(searchValue) ||
					categoryName.includes(searchValue);

				return matchesCategory && matchesSearch;
			}),
		[activeServiceCategory, categoryMap, searchValue, services],
	);

	const activeItems = mode === "products" ? filteredProducts : filteredServices;

	const paymentMethodOptions = useMemo(
		() => [
			{ value: "none", label: "No payment method" },
			...(paymentMethodsQuery.data ?? []).map(
				(paymentMethod: PaymentMethod) => ({
					value: String(paymentMethod.id),
					label: paymentMethod.name,
				}),
			),
		],
		[paymentMethodsQuery.data],
	);
	const availableCampaigns = useMemo(() => {
		const now = new Date();
		return (campaignsQuery.data ?? []).filter((campaign) =>
			isCampaignAvailable(campaign, now),
		);
	}, [campaignsQuery.data]);
	const campaignOptions = useMemo(
		() => [
			{ value: "none", label: "No campaign" },
			...availableCampaigns.map((campaign) => ({
				value: String(campaign.id),
				label: `${campaign.code} - ${campaign.name}`,
			})),
		],
		[availableCampaigns],
	);

	const selectedCampaign = useMemo(
		() =>
			selectedCampaignId
				? availableCampaigns.find(
						(campaign) => campaign.id === Number(selectedCampaignId),
					)
				: undefined,
		[availableCampaigns, selectedCampaignId],
	);
	const selectedStore = useMemo(
		() =>
			selectedStoreNumber
				? visibleStores.find((store: Store) => store.id === selectedStoreNumber)
				: undefined,
		[selectedStoreNumber, visibleStores],
	);

	useEffect(() => {
		if (!selectedCampaignId) {
			return;
		}

		const hasCampaign = availableCampaigns.some(
			(campaign) => campaign.id === Number(selectedCampaignId),
		);

		if (!hasCampaign) {
			form.setValue("selectedCampaignId", "", { shouldValidate: true });
		}
	}, [availableCampaigns, form, selectedCampaignId]);

	const cartProductRows = useMemo(
		() =>
			productCart
				.map((line) => ({
					...line,
					product: productMap.get(line.id),
				}))
				.filter(
					(line): line is ProductCartDisplayLine => line.product !== undefined,
				),
		[productCart, productMap],
	);
	const cartServiceRows = useMemo(
		() =>
			serviceCart
				.map((line) => ({
					...line,
					service: serviceMap.get(line.id),
				}))
				.filter(
					(line): line is ServiceCartDisplayLine => line.service !== undefined,
				),
		[serviceCart, serviceMap],
	);

	const productCartQtyById = useMemo(
		() => new Map(productCart.map((line) => [line.id, line.qty])),
		[productCart],
	);
	const serviceCartQtyById = useMemo(
		() =>
			serviceCart.reduce((bucket, line) => {
				bucket.set(line.id, (bucket.get(line.id) ?? 0) + 1);
				return bucket;
			}, new Map<number, number>()),
		[serviceCart],
	);

	const productSubtotal = cartProductRows.reduce(
		(total, line) => total + Number(line.product.price) * line.qty,
		0,
	);
	const serviceSubtotal = cartServiceRows.reduce(
		(total, line) => total + Number(line.service.price),
		0,
	);
	const subtotal = productSubtotal + serviceSubtotal;
	const campaignDiscount = getCampaignDiscount(subtotal, selectedCampaign);
	const discountValue = Number(manualDiscount || 0);
	const totalDiscount = Math.min(subtotal, discountValue + campaignDiscount);
	const total = Math.max(0, subtotal - totalDiscount);
	const cartCount =
		productCart.reduce((sum, item) => sum + item.qty, 0) + serviceCart.length;

	const selectedPaymentMethodLabel = selectedPaymentMethodId
		? findOptionLabel(paymentMethodOptions, selectedPaymentMethodId)
		: undefined;

	const createMutation = useMutation({
		mutationKey: ["create-pos-order"],
		mutationFn: createOrder,
	});

	const updateProductCart = (
		nextCart: TransactionDraftValues["productCart"],
	) => {
		setSubmitError("");
		form.setValue("productCart", nextCart, {
			shouldDirty: true,
			shouldValidate: true,
		});
	};

	const updateServiceCart = (
		nextCart: TransactionDraftValues["serviceCart"],
	) => {
		setSubmitError("");
		form.setValue("serviceCart", nextCart, {
			shouldDirty: true,
			shouldValidate: true,
		});
	};

	const handleAddProduct = (product: Product) => {
		const currentCart = form.getValues("productCart");
		const nextCart = [...currentCart];
		const lineIndex = nextCart.findIndex((line) => line.id === product.id);
		const maxStock = Number(product.stock ?? 0);

		if (lineIndex >= 0) {
			const line = nextCart[lineIndex];

			if (maxStock > 0 && line.qty >= maxStock) {
				return;
			}

			nextCart[lineIndex] = { ...line, qty: line.qty + 1 };
			updateProductCart(nextCart);
			return;
		}

		if (maxStock <= 0) {
			return;
		}

		updateProductCart([
			...nextCart,
			{ kind: "product", id: product.id, qty: 1 },
		]);
	};

	const handleAddService = (service: Service) => {
		updateServiceCart([
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
	};

	const handleStoreChange = (value: string) => {
		setSubmitError("");
		form.setValue("selectedStoreId", value, {
			shouldDirty: true,
			shouldValidate: true,
		});
		if (currentUserKey) {
			setPersistedSelectedStoreId(currentUserKey, value);
		}
		form.setValue("selectedCampaignId", "", {
			shouldDirty: true,
			shouldValidate: true,
		});
	};

	const resetCart = () => {
		setSubmitError("");
		form.reset({
			...defaultDraftValues,
			selectedStoreId: form.getValues("selectedStoreId"),
		});
	};

	const handleSubmit = form.handleSubmit(async (values) => {
		setSubmitError("");

		try {
			const created = await createMutation.mutateAsync(
				toTransactionPayload(values),
			);

			await handleCreatedOrderSuccess({
				created,
				queryClient,
				onFallbackNavigate: () => {
					resetCart();
					void navigate({ to: "/orders", search: { page: 1 } });
				},
				onOrderDetailNavigate: (orderId) => {
					resetCart();
					void navigate({
						to: "/orders/$orderId",
						params: { orderId: String(orderId) },
					});
				},
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create transaction";
			setSubmitError(message);
			toast.error("Unable to create transaction", {
				description: message,
			});
		}
	});

	return {
		form,
		isAdmin: currentUser?.role === "admin",
		isBootstrapping,
		mode,
		searchTerm,
		activeProductCategory,
		activeServiceCategory,
		selectedStoreId,
		selectedCustomerId,
		selectedCampaignId,
		selectedPaymentMethodId,
		selectedPaymentMethodLabel,
		paymentStatus,
		manualDiscount,
		notes,
		submitError,
		products,
		services,
		visibleStores,
		selectedStoreNumber,
		selectedStore,
		selectedCampaign,
		categoryMap,
		productTabs,
		serviceTabs,
		activeItems,
		campaignOptions,
		paymentMethodOptions,
		campaignsLoading: campaignsQuery.isFetching,
		paymentMethodsLoading: paymentMethodsQuery.isFetching,
		cartProductRows,
		cartServiceRows,
		productCartQtyById,
		serviceCartQtyById,
		campaignDiscount,
		discountValue,
		subtotal,
		total,
		cartCount,
		isSubmitting: createMutation.isPending,
		setMode,
		setSearchTerm,
		setActiveProductCategory,
		setActiveServiceCategory,
		handleStoreChange,
		resetCart,
		removeProductFromCart: (productId: number) =>
			updateProductCart(productCart.filter((line) => line.id !== productId)),
		removeServiceFromCart: (lineId: string) =>
			updateServiceCart(serviceCart.filter((line) => line.line_id !== lineId)),
		updateProductQty: (
			productId: number,
			nextQty: number,
			maxStock: number,
		) => {
			updateProductCart(
				productCart.flatMap((line) => {
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
		updateServiceBrand: (lineId: string, value: string) => {
			updateServiceCart(
				serviceCart.map((line) =>
					line.line_id === lineId ? { ...line, shoe_brand: value } : line,
				),
			);
		},
		updateServiceColor: (lineId: string, value: string) => {
			updateServiceCart(
				serviceCart.map((line) =>
					line.line_id === lineId ? { ...line, color: value } : line,
				),
			);
		},
		updateServiceSize: (lineId: string, value: string) => {
			updateServiceCart(
				serviceCart.map((line) =>
					line.line_id === lineId ? { ...line, shoe_size: value } : line,
				),
			);
		},
		handleAddProduct,
		handleAddService,
		handleSubmit,
	};
}
