import { isValidPhoneNumber } from "@fresclean/api/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { ResolvedVoucher } from "@/features/campaigns/api";
import { createOrder } from "@/features/orders/api";
import {
	getCreatedOrderId,
	handleCreatedOrderSuccess,
} from "@/features/orders/lib/create-order-workflow";
import {
	isAcceptedImage,
	uploadOrderDropoffPhoto,
} from "@/features/orders/utils/photo-upload";
import { printOrderReceipt } from "@/features/printing/print-order-receipt";
import {
	NoRegisteredDeviceError,
	PrinterNotPairedError,
} from "@/features/printing/printer-transport";
import { storesQueries } from "@/features/stores/api";
import {
	countCartTreatments,
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
import { usersQueries } from "@/features/users/api";
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
		// Carried from the Voucher code check for the price preview, not checked again.
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
		// One entry per Item, Services nested (ADR-0017). Brand, size and the rest
		// only help match the Item at pickup, so the POS never blocks on them.
		itemCart: z.array(
			z.object({
				line_id: z.string(),
				brand: z.string(),
				color: z.string(),
				model: z.string(),
				size: z.string(),
				services: z.array(
					z.object({
						kind: z.literal("service"),
						line_id: z.string(),
						id: z.number(),
						notes: z.string(),
						// Blank is valid (ADR-0018): a Repair is priced after
						// inspection; only paying now needs every line priced.
						price: z.string(),
					}),
				),
			}),
		),
	})
	.superRefine((values, ctx) => {
		if (
			values.productCart.length === 0 &&
			countCartTreatments(values.itemCart) === 0
		) {
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
	const storesQuery = useQuery(storesQueries.list());
	const meQuery = useQuery({
		...usersQueries.me(),
		enabled: !!currentUser,
	});

	// Role from the server, not the sign-in token, which goes stale when an
	// admin changes it mid-session.
	const isAdmin = meQuery.data?.role === "admin";

	const visibleStores = useMemo(() => {
		const stores = storesQuery.data ?? [];
		if (isAdmin) {
			return stores;
		}
		const userStoreIds =
			meQuery.data?.userStores?.map((item) => item.store_id) ?? [];
		return stores.filter((store) => userStoreIds.includes(store.id));
	}, [isAdmin, storesQuery.data, meQuery.data]);

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
		// No global error toast: the sheet footer already reports a failed
		// checkout.
		onError: () => undefined,
	});

	const resetCart = useCallback(() => {
		const { setSubmitError, setDropoffPhoto } =
			useTransactionsPageStore.getState();
		resetTransactionDraft(form, { setSubmitError, setDropoffPhoto });
	}, [form]);

	// A rejected checkout lands in the footer error; a photo or Receipt failure
	// after the Order is placed gets its own toast and never fails the Order.
	const onValidSubmit = useCallback(
		async (values: TransactionDraftValues) => {
			useTransactionsPageStore.getState().setSubmitError("");

			try {
				const created = await createMutation.mutateAsync(
					toOrderPayload(values),
				);

				// A failed drop-off photo must not fail the Order; the cashier
				// retries it from the Order page.
				const orderId = getCreatedOrderId(created);

				// A Receipt failure never delays the Order; the cashier reprints
				// from the Order page. Skipped without Web Bluetooth, or every
				// checkout on that browser would show an error.
				if (orderId && navigator.bluetooth) {
					void printOrderReceipt(orderId, { allowPairing: false }).catch(
						(error: unknown) => {
							if (error instanceof NoRegisteredDeviceError) {
								toast.info("No printer registered", {
									description: "Add one from Devices next to the Store name.",
								});
								return;
							}
							if (error instanceof PrinterNotPairedError) {
								toast.info("Pair a printer to auto-print", {
									description: "Open the Order and tap Print receipt.",
								});
								return;
							}
							toast.error("Couldn't print receipt", {
								description: "Reprint it from the Order page.",
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
						toast.error("Couldn't upload drop-off photo", {
							description: "Add it from the Order page.",
						});
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
					readServerErrorMessage(error, "Couldn't create Order"),
				);
				useTransactionsPageStore.getState().setSubmitError(issue.message);
			}
		},
		[createMutation, navigate, queryClient, resetCart],
	);

	// A failing field can sit on a step the cashier isn't looking at, so the
	// footer names each one, in the order to fix them.
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
			// Voucher codes were checked against the previous Store, so they must
			// be entered again.
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
