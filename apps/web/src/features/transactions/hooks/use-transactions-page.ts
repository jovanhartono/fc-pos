import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { handleCreatedOrderSuccess } from "@/features/orders/lib/create-order-workflow";
import {
	type TransactionDraftValues,
	toTransactionPayload,
} from "@/features/transactions/lib/transactions";
import type { TransactionsPageContextValue } from "@/features/transactions/lib/transactions-context";
import { createOrder } from "@/lib/api";
import {
	currentUserDetailQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import { getCurrentUser } from "@/stores/auth-store";
import { useTransactionPreferencesStore } from "@/stores/transaction-preferences-store";
import { useTransactionsPageStore } from "@/stores/transactions-store";

const defaultDraftValues: TransactionDraftValues = {
	selectedStoreId: "",
	selectedCustomerId: "",
	selectedCampaignIds: [],
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
		selectedCampaignIds: z.array(z.string()),
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
	});

export type TransactionsPageBootstrap = {
	form: ReturnType<typeof useForm<TransactionDraftValues>>;
	isBootstrapping: boolean;
	pageContext: TransactionsPageContextValue;
};

export function useTransactionsPageBootstrap(): TransactionsPageBootstrap {
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
	const storesQuery = useQuery(storesQueryOptions());
	const currentUserDetailQuery = useQuery({
		...currentUserDetailQueryOptions(currentUser?.id ?? -1),
		enabled: !!currentUser,
	});

	const userStoreIds =
		currentUserDetailQuery.data?.userStores?.map((item) => item.store_id) ?? [];

	const isAdmin = currentUser?.role === "admin";

	const visibleStores = useMemo(() => {
		const stores = storesQuery.data ?? [];
		if (isAdmin) {
			return stores;
		}
		return stores.filter((store) => userStoreIds.includes(store.id));
	}, [isAdmin, storesQuery.data, userStoreIds]);

	useEffect(() => {
		const canResolveStoreSelection =
			storesQuery.isSuccess && (isAdmin || currentUserDetailQuery.isSuccess);

		if (!canResolveStoreSelection || !currentUserKey) {
			return;
		}

		const hasPersistedVisibleStore =
			persistedSelectedStoreId.length > 0 &&
			visibleStores.some(
				(store) => String(store.id) === persistedSelectedStoreId,
			);
		const fallbackStoreId = isAdmin ? "" : String(visibleStores[0]?.id ?? "");
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
		currentUserDetailQuery.isSuccess,
		currentUserKey,
		form,
		isAdmin,
		persistedSelectedStoreId,
		selectedStoreId,
		setPersistedSelectedStoreId,
		storesQuery.isSuccess,
		visibleStores,
	]);

	const isBootstrapping =
		storesQuery.isPending || currentUserDetailQuery.isPending;

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

	const handleStoreChange = useCallback(
		(value: string) => {
			useTransactionsPageStore.getState().setSubmitError("");
			form.setValue("selectedStoreId", value, {
				shouldDirty: true,
				shouldValidate: true,
			});
			if (currentUserKey) {
				useTransactionPreferencesStore
					.getState()
					.setSelectedStoreId(currentUserKey, value);
			}
			form.setValue("selectedCampaignIds", [], {
				shouldDirty: true,
				shouldValidate: true,
			});
		},
		[currentUserKey, form],
	);

	useEffect(
		() => () => {
			useTransactionsPageStore.getState().resetUi();
		},
		[],
	);

	const pageContext = useMemo<TransactionsPageContextValue>(
		() => ({
			isAdmin,
			visibleStores,
			submit,
			handleStoreChange,
		}),
		[handleStoreChange, isAdmin, submit, visibleStores],
	);

	return { form, isBootstrapping, pageContext };
}
