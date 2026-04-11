import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { handleCreatedOrderSuccess } from "@/features/orders/lib/create-order-workflow";
import {
	isCampaignAvailable,
	type TransactionDraftValues,
	toTransactionPayload,
} from "@/features/transactions/lib/transactions";
import { createOrder } from "@/lib/api";
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
import {
	bindTransactionsPageController,
	clearTransactionsPageController,
	transactionsPageDataInitialState,
	useTransactionsPageStore,
} from "@/stores/transactions-store";

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

const transactionDraftSchema = z
	.object({
		selectedStoreId: z
			.string()
			.trim()
			.min(1, "Store is required before creating a transaction."),
		selectedCustomerId: z.string().trim().min(1, "Customer is required."),
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
				brand: z.string(),
				color: z.string(),
				model: z.string(),
				size: z.string(),
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

export function useTransactionsPageBootstrap() {
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

	const form = useForm<TransactionDraftValues>({
		resolver: zodResolver(transactionDraftSchema),
		defaultValues: defaultDraftValues,
	});

	const selectedStoreId =
		useWatch({
			control: form.control,
			name: "selectedStoreId",
		}) ?? "";
	const selectedCampaignId =
		useWatch({
			control: form.control,
			name: "selectedCampaignId",
		}) ?? "";

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

	const availableCampaigns = useMemo(() => {
		const now = new Date();
		return (campaignsQuery.data ?? []).filter((campaign) =>
			isCampaignAvailable(campaign, now),
		);
	}, [campaignsQuery.data]);

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

	const isBootstrapping =
		storesQuery.isPending ||
		categoriesQuery.isPending ||
		productsQuery.isPending ||
		servicesQuery.isPending ||
		paymentMethodsQuery.isPending ||
		currentUserDetailQuery.isPending;

	const products = useMemo(
		() => (productsQuery.data ?? []).filter((product) => product.is_active),
		[productsQuery.data],
	);
	const services = useMemo(
		() => (servicesQuery.data ?? []).filter((service) => service.is_active),
		[servicesQuery.data],
	);

	const createMutation = useMutation({
		mutationKey: ["create-pos-order"],
		mutationFn: createOrder,
	});

	const resetCart = useCallback(() => {
		const selectedStore = form.getValues("selectedStoreId");

		useTransactionsPageStore.getState().setSubmitError("");
		form.reset({
			...defaultDraftValues,
			selectedStoreId: selectedStore,
		});
	}, [form]);

	const onValidSubmit = useCallback(
		async (values: TransactionDraftValues) => {
			useTransactionsPageStore.getState().setSubmitError("");

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
					error instanceof Error
						? error.message
						: "Failed to create transaction";
				useTransactionsPageStore.getState().setSubmitError(message);
				toast.error("Unable to create transaction", {
					description: message,
				});
			}
		},
		[createMutation, navigate, queryClient, resetCart],
	);

	const submit = useMemo(
		() => form.handleSubmit(onValidSubmit),
		[form, onValidSubmit],
	);

	useEffect(() => {
		bindTransactionsPageController({
			form,
			currentUserKey,
			submit,
		});

		return () => {
			clearTransactionsPageController();
		};
	}, [currentUserKey, form, submit]);

	const pageState = useMemo(
		() => ({
			isBootstrapping,
			isAdmin: currentUser?.role === "admin",
			visibleStores,
			categories: categoriesQuery.data ?? [],
			products,
			services,
			campaigns: availableCampaigns,
			paymentMethods: paymentMethodsQuery.data ?? [],
			campaignsLoading: campaignsQuery.isFetching,
			paymentMethodsLoading: paymentMethodsQuery.isFetching,
			isSubmitting: createMutation.isPending,
		}),
		[
			availableCampaigns,
			campaignsQuery.isFetching,
			categoriesQuery.data,
			createMutation.isPending,
			currentUser?.role,
			isBootstrapping,
			paymentMethodsQuery.data,
			paymentMethodsQuery.isFetching,
			products,
			services,
			visibleStores,
		],
	);

	useEffect(() => {
		useTransactionsPageStore.setState(pageState);
	}, [pageState]);

	useEffect(
		() => () => {
			clearTransactionsPageController();
			useTransactionsPageStore.setState(transactionsPageDataInitialState);
		},
		[],
	);

	return form;
}

export const useTransactionsPage = useTransactionsPageBootstrap;
