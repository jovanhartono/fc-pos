import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	getCreatedOrderId,
	handleCreatedOrderSuccess,
} from "@/features/orders/lib/create-order-workflow";
import {
	isAcceptedImage,
	uploadOrderDropoffPhoto,
} from "@/features/orders/utils/photo-upload";
import { printOrderReceipt } from "@/features/printing/print-order-receipt";
import { PrinterNotPairedError } from "@/features/printing/printer-transport";
import {
	defaultDraftValues,
	resetTransactionDraft,
	type TransactionDraftValues,
	toOrderPayload,
} from "@/features/transactions/cart/cart";
import {
	collectCheckoutIssues,
	describeServerFailure,
	summarizeCheckoutIssues,
} from "@/features/transactions/lib/checkout-issues";
import type { TransactionsPageContextValue } from "@/features/transactions/lib/transactions-context";
import { createOrder, type ResolvedVoucher } from "@/lib/api";
import { isValidPhoneNumber } from "@/lib/phone-number";
import { meQueryOptions, storesQueryOptions } from "@/lib/query-options";
import { readServerErrorMessage } from "@/lib/server-error";
import { getCurrentUser } from "@/stores/auth-store";
import { useTransactionPreferencesStore } from "@/stores/transaction-preferences-store";
import { useTransactionsPageStore } from "@/stores/transactions-store";

const transactionDraftSchema = z
	.object({
		selectedStoreId: z.string().trim().min(1, "Store is required."),
		customerName: z.string().trim().min(1, "Customer name is required."),
		customerPhone: z
			.string()
			.trim()
			.min(1, "Phone number is required.")
			.refine(isValidPhoneNumber, "Invalid phone number"),
		selectedCampaignIds: z.array(z.string()),
		// The campaign shape comes straight from the resolve-code response; it is
		// carried for the pricing preview, not re-validated here.
		appliedVouchers: z.array(
			z.object({
				code: z.string(),
				campaign: z.custom<ResolvedVoucher>(),
			}),
		),
		selectedPaymentMethodId: z.string(),
		selectedCourierId: z.string(),
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
				notes: z.string(),
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
	const meQuery = useQuery({
		...meQueryOptions(),
		enabled: !!currentUser,
	});

	const userStoreIds =
		meQuery.data?.userStores?.map((item) => item.store_id) ?? [];

	// DB-fresh role — JWT claim goes stale on mid-session role changes.
	const isAdmin = meQuery.data?.role === "admin";

	const visibleStores = useMemo(() => {
		const stores = storesQuery.data ?? [];
		if (isAdmin) {
			return stores;
		}
		return stores.filter((store) => userStoreIds.includes(store.id));
	}, [isAdmin, storesQuery.data, userStoreIds]);

	useEffect(() => {
		const canResolveStoreSelection =
			storesQuery.isSuccess && (isAdmin || meQuery.isSuccess);

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
		meQuery.isSuccess,
		currentUserKey,
		form,
		isAdmin,
		persistedSelectedStoreId,
		selectedStoreId,
		setPersistedSelectedStoreId,
		storesQuery.isSuccess,
		visibleStores,
	]);

	const isBootstrapping = storesQuery.isPending || meQuery.isPending;

	const createMutation = useMutation({
		mutationKey: ["create-pos-order"],
		mutationFn: createOrder,
		// Opt out of the global error toast (main.tsx): a failed checkout is
		// already reported inline by the sheet footer, and the global one would
		// fire alongside it as a second, blunter copy.
		onError: () => undefined,
	});

	const resetCart = useCallback(() => {
		const { setSubmitError, setDropoffPhoto } =
			useTransactionsPageStore.getState();
		resetTransactionDraft(form, { setSubmitError, setDropoffPhoto });
	}, [form]);

	// A rejected checkout lands in the footer error; post-commit hiccups (photo,
	// receipt) keep their own toasts — they don't fail the Order.
	const onValidSubmit = useCallback(
		async (values: TransactionDraftValues) => {
			useTransactionsPageStore.getState().setSubmitError("");

			try {
				const created = await createMutation.mutateAsync(
					toOrderPayload(values),
				);

				// Order is committed; attach the drop-off photo now that we have an
				// id. A failed attach must NOT fail the Order — surface it and let the
				// cashier retry from the order detail card.
				const orderId = getCreatedOrderId(created);

				// Fire-and-forget auto-print: a receipt failure must never fail
				// or delay the Order — surface it and let the cashier reprint
				// from the order detail menu. Skip entirely where the browser
				// can't print at all (no Web Bluetooth) so we don't red-toast
				// every checkout on an unsupported browser.
				if (orderId && navigator.bluetooth) {
					void printOrderReceipt(orderId, { allowPairing: false }).catch(
						(error: unknown) => {
							if (error instanceof PrinterNotPairedError) {
								toast.info("Order created. Pair a printer to auto-print", {
									description: "Open the order and use Print receipt.",
								});
								return;
							}
							toast.error("Order created, but the receipt failed to print", {
								description: "Reprint from the order detail page.",
							});
						},
					);
				}

				const { dropoffPhoto } = useTransactionsPageStore.getState();
				if (orderId && dropoffPhoto && isAcceptedImage(dropoffPhoto.type)) {
					try {
						await uploadOrderDropoffPhoto(orderId, {
							file: dropoffPhoto,
							contentType: dropoffPhoto.type,
						});
					} catch {
						toast.error(
							"Order created, but the drop-off photo failed to upload",
							{
								description: "Open the order to add it.",
							},
						);
					}
				}

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
				const issue = describeServerFailure(
					readServerErrorMessage(error, "Failed to create transaction"),
				);
				useTransactionsPageStore.getState().setSubmitError(issue.message);
			}
		},
		[createMutation, navigate, queryClient, resetCart],
	);

	// onInvalid names each blocked field in the footer error, in fix order: a
	// failing field can sit on a step the cashier isn't looking at, so the footer
	// line is what tells them a hidden step needs attention.
	const submit = useMemo(
		() =>
			form.handleSubmit(onValidSubmit, (errors) => {
				useTransactionsPageStore
					.getState()
					.setSubmitError(
						summarizeCheckoutIssues(collectCheckoutIssues(errors)),
					);
			}),
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
			// Vouchers were resolved against the previous store, so they must be
			// re-entered.
			form.setValue("appliedVouchers", [], {
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
