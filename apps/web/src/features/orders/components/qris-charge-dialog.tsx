import { GATEWAY_LABELS } from "@fresclean/api/rules";
import {
	Alert02Icon,
	Clock01Icon,
	Loading03Icon,
	RefreshIcon,
	SmartPhone01Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	PaymentOutcome,
	type PaymentOutcomeProps,
} from "@/components/payment-outcome";
import { QrisWaiting } from "@/components/qris-waiting";
import { Button } from "@/components/ui/button";
import {
	type CreatePaymentChargePayload,
	ordersQueries,
	type PaymentCharge,
} from "@/features/orders/api";
import {
	useCancelPaymentChargeMutation,
	useCreatePaymentChargeMutation,
} from "@/features/orders/hooks/useOrderMutations";
import { onQrisPaid } from "@/lib/cache-events";
import { qrisImageSrc } from "@/lib/qris";
import { readServerErrorMessage } from "@/lib/server-error";
import { formatMoney } from "@/shared/money";
import { useDialog } from "@/stores/dialog-store";

type GatewayName = PaymentCharge["gateway"];

// A New QRIS from a reopened dialog asks for the same discounts as the first.
const requestOfCharge = (
	charge: PaymentCharge,
): CreatePaymentChargePayload => ({
	campaign_ids: charge.discount_request?.campaign_ids ?? [],
	voucher_codes: charge.discount_request?.voucher_codes ?? [],
	discount: String(charge.discount_request?.discount ?? 0),
});

// showNew creates the QRIS as the dialog opens; reopen shows one from the Order.
export const useOpenQrisDialog = (orderId: number) => {
	const openDialog = useDialog((s) => s.openDialog);

	const open = (
		gateway: GatewayName,
		props: Omit<QrisChargeDialogProps, "orderId">,
	) =>
		openDialog({
			title: `QRIS · ${GATEWAY_LABELS[gateway]}`,
			contentClassName: "sm:max-w-sm",
			content: () => <QrisChargeDialog orderId={orderId} {...props} />,
		});

	return {
		showNew: (gateway: GatewayName, request: CreatePaymentChargePayload) =>
			open(gateway, { request }),
		reopen: (charge: PaymentCharge) =>
			open(charge.gateway, {
				initialCharge: charge,
				request: requestOfCharge(charge),
			}),
	};
};

interface QrisChargeDialogProps {
	orderId: number;
	initialCharge?: PaymentCharge;
	request: CreatePaymentChargePayload;
}

const QrisChargeDialog = ({
	orderId,
	initialCharge,
	request,
}: QrisChargeDialogProps) => {
	const queryClient = useQueryClient();
	const closeDialog = useDialog((s) => s.closeDialog);
	const [chargeId, setChargeId] = useState(initialCharge?.id ?? null);
	const chargeQuery = useQuery({
		...ordersQueries.paymentCharge(orderId, chargeId ?? 0),
		enabled: chargeId !== null,
	});
	const createMutation = useCreatePaymentChargeMutation(orderId);
	const cancelMutation = useCancelPaymentChargeMutation(orderId);
	const charge =
		chargeQuery.data ?? (chargeId === initialCharge?.id ? initialCharge : null);
	const { mutate: create } = createMutation;
	const startedRef = useRef(false);

	const handleCreate = useCallback(
		() => create(request, { onSuccess: (next) => setChargeId(next.id) }),
		[create, request],
	);

	useEffect(() => {
		if (initialCharge || startedRef.current) {
			return;
		}
		startedRef.current = true;
		handleCreate();
	}, [handleCreate, initialCharge]);

	// The Order page under the dialog turns paid while the dialog says so.
	useEffect(() => {
		if (charge?.status === "paid") {
			void onQrisPaid(queryClient);
		}
	}, [charge?.status, queryClient]);

	const handleCancel = (id: number) =>
		cancelMutation.mutate(id, {
			onSuccess: (next) => {
				if (next.status !== "paid") {
					closeDialog();
				}
			},
		});

	if (createMutation.isError) {
		return (
			<div className="grid gap-4">
				<PaymentOutcome
					icon={Alert02Icon}
					text={readServerErrorMessage(createMutation.error)}
					title="Couldn't Create QRIS"
					tone="bad"
				/>
				<Button
					loading={createMutation.isPending}
					onClick={handleCreate}
					size="lg"
					type="button"
				>
					Try Again
				</Button>
			</div>
		);
	}

	if (!charge) {
		return (
			<div
				aria-busy="true"
				className="grid aspect-square w-full max-w-60 place-items-center justify-self-center"
			>
				<HugeiconsIcon
					aria-label="Creating QRIS"
					className="size-6 animate-spin text-muted-foreground"
					icon={Loading03Icon}
				/>
			</div>
		);
	}

	if (charge.status === "pending") {
		return (
			<div className="grid gap-4">
				<PendingCharge charge={charge} />
				<Button
					loading={cancelMutation.isPending}
					onClick={() => handleCancel(charge.id)}
					size="lg"
					type="button"
					variant="outline"
				>
					Cancel QRIS
				</Button>
			</div>
		);
	}

	const outcome = outcomeOf(charge);
	return (
		<div className="grid gap-4">
			<PaymentOutcome {...outcome} />
			{outcome.next === "new" ? (
				<Button
					loading={createMutation.isPending}
					onClick={handleCreate}
					size="lg"
					type="button"
				>
					New QRIS
				</Button>
			) : (
				<Button
					onClick={closeDialog}
					size="lg"
					type="button"
					variant={outcome.next === "done" ? "default" : "outline"}
				>
					{outcome.next === "done" ? "Done" : "Close"}
				</Button>
			)}
		</div>
	);
};

interface PendingChargeProps {
	charge: PaymentCharge;
}

const PendingCharge = ({ charge }: PendingChargeProps) => {
	const qrSrc = qrisImageSrc(charge);

	// DOKU without its QRIS keys sends only a hosted QRIS page.
	if (qrSrc) {
		return (
			<>
				<ChargeAmount amount={charge.amount} />
				<img
					alt="QRIS"
					className="aspect-square w-full max-w-60 justify-self-center rounded-md border bg-white p-3"
					src={qrSrc}
				/>
				<QrisWaiting
					expiresAt={charge.expires_at}
					mockPageUrl={charge.redirect_url}
				/>
			</>
		);
	}

	return (
		<>
			<ChargeAmount amount={charge.amount} />
			<Button
				disabled={!charge.redirect_url}
				// Opened inside the tap: iOS blocks a tab opened after an await.
				onClick={() => {
					if (charge.redirect_url) {
						window.open(charge.redirect_url, "_blank");
					}
				}}
				size="lg"
				type="button"
			>
				Open QRIS Page
			</Button>
			<p className="text-balance text-center text-muted-foreground text-subhead">
				The QRIS opens in a new tab. Show it to the Customer to scan.
			</p>
			<QrisWaiting expiresAt={charge.expires_at} mockPageUrl={null} />
		</>
	);
};

interface ChargeAmountProps {
	amount: number;
}

const ChargeAmount = ({ amount }: ChargeAmountProps) => (
	<p className="text-center font-semibold text-title-1 tabular-nums">
		{formatMoney(amount)}
	</p>
);

interface Outcome extends PaymentOutcomeProps {
	next: "new" | "close" | "done";
}

const outcomeOf = (charge: PaymentCharge): Outcome => {
	const amount = formatMoney(charge.amount);

	switch (charge.status) {
		case "paid":
			return {
				icon: Tick02Icon,
				tone: "good",
				title: "Payment Received",
				text: `The Customer paid ${amount}.`,
				next: "done",
			};
		case "expired":
			return {
				icon: Clock01Icon,
				tone: "neutral",
				title: "QRIS Expired",
				text: "The Customer didn't pay in time. Show a new QRIS to try again.",
				next: "new",
			};
		case "failed":
			return {
				icon: Alert02Icon,
				tone: "bad",
				title: "Payment Failed",
				text: "The Customer's payment didn't go through. Show a new QRIS to try again.",
				next: "new",
			};
		case "needs_review":
			return {
				icon: Alert02Icon,
				tone: "warn",
				title: "Payment Needs Review",
				text: `${amount} arrived but couldn't be applied to this Order. Ask an admin to check it.`,
				next: "close",
			};
		default:
			return closedOutcome(charge);
	}
};

const closedOutcome = (charge: PaymentCharge): Outcome => {
	switch (charge.closed_reason) {
		case "order_paid":
			return {
				icon: Tick02Icon,
				tone: "neutral",
				title: "Already Paid",
				text: "This Order was paid another way, so this QRIS was closed.",
				next: "close",
			};
		case "customer_paying":
			return {
				icon: SmartPhone01Icon,
				tone: "neutral",
				title: "Paying on Their Phone",
				text: "The Customer chose to pay from the Track page, so this QRIS was closed.",
				next: "close",
			};
		case "replaced":
			return {
				icon: RefreshIcon,
				tone: "neutral",
				title: "QRIS Replaced",
				text: "A newer QRIS was shown for this Order.",
				next: "close",
			};
		default:
			return totalChangedOutcome(charge);
	}
};

const totalChangedOutcome = ({
	amount: chargeAmount,
	next_amount: nextAmount,
}: PaymentCharge): Outcome => {
	// Closed without the total moving, like a Track page that failed to open.
	if (nextAmount === chargeAmount) {
		return {
			icon: RefreshIcon,
			tone: "neutral",
			title: "QRIS Closed",
			text: "This QRIS closed before it was paid. Show a new one to try again.",
			next: "new",
		};
	}
	if (nextAmount === 0) {
		return {
			icon: RefreshIcon,
			tone: "neutral",
			title: "Total Changed",
			text: "Nothing is left to pay on this Order.",
			next: "close",
		};
	}
	return {
		icon: RefreshIcon,
		tone: "neutral",
		title: "Total Changed",
		text:
			nextAmount === null
				? "The Order changed after this QRIS was shown. Show a new one for the new total."
				: `This QRIS was for ${formatMoney(chargeAmount)}. Show a new one for ${formatMoney(nextAmount)}.`,
		next: "new",
	};
};
