import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { onOrderMoved, onRedemptionSpent } from "@/lib/cache-events";
import { formatMoney } from "@/shared/money";
import { useSheet } from "@/stores/sheet-store";

const MINUTE_MS = 60_000;

const ENDED_TEXT: Partial<Record<PaymentCharge["status"], string>> = {
	expired: "QRIS expired.",
	cancelled: "QRIS cancelled.",
	failed: "QRIS failed.",
};

interface QrisChargeSheetProps {
	orderId: number;
	initialCharge: PaymentCharge;
	request: CreatePaymentChargePayload;
}

export const QrisChargeSheet = ({
	orderId,
	initialCharge,
	request,
}: QrisChargeSheetProps) => {
	const queryClient = useQueryClient();
	const goBack = useSheet((s) => s.goBack);
	const [chargeId, setChargeId] = useState(initialCharge.id);
	const chargeQuery = useQuery(ordersQueries.paymentCharge(orderId, chargeId));
	const createMutation = useCreatePaymentChargeMutation(orderId);
	const cancelMutation = useCancelPaymentChargeMutation(orderId);
	const charge = chargeQuery.data ?? initialCharge;
	const handledPaidRef = useRef(false);

	// Paid: back past the Collect payment sheet to the Order, which now reads paid.
	useEffect(() => {
		if (charge.status !== "paid" || handledPaidRef.current) {
			return;
		}
		handledPaidRef.current = true;
		toast.success("Paid");
		void Promise.all([
			onOrderMoved(queryClient),
			onRedemptionSpent(queryClient),
		]);
		goBack();
		goBack();
	}, [charge.status, goBack, queryClient]);

	const handleNewQris = () =>
		createMutation.mutate(request, {
			onSuccess: (next) => setChargeId(next.id),
		});

	const handleCancel = () =>
		cancelMutation.mutate(charge.id, {
			onSuccess: (next) => {
				if (next.status !== "paid") {
					goBack();
				}
			},
		});

	return (
		<div className="grid gap-4">
			<div className="flex items-center justify-between gap-4 font-medium text-body">
				<span>To collect</span>
				<span className="tabular-nums">{formatMoney(charge.amount)}</span>
			</div>
			<ChargeBody charge={charge} />
			{charge.status === "pending" ? (
				<Button
					loading={cancelMutation.isPending}
					onClick={handleCancel}
					size="lg"
					type="button"
					variant="outline"
				>
					Cancel
				</Button>
			) : null}
			{ENDED_TEXT[charge.status] ? (
				<Button
					loading={createMutation.isPending}
					onClick={handleNewQris}
					size="lg"
					type="button"
				>
					New QRIS
				</Button>
			) : null}
		</div>
	);
};

interface ChargeBodyProps {
	charge: PaymentCharge;
}

const ChargeBody = ({ charge }: ChargeBodyProps) => {
	if (charge.status === "pending") {
		return <PendingCharge charge={charge} />;
	}
	if (charge.status === "needs_review") {
		return (
			<p className="font-medium text-body text-destructive">
				Payment received but not applied — check with admin
			</p>
		);
	}
	if (charge.status === "paid") {
		return <p className="font-medium text-body text-success">Paid</p>;
	}
	return <p className="text-body">{ENDED_TEXT[charge.status]}</p>;
};

const PendingCharge = ({ charge }: ChargeBodyProps) => {
	const now = useMinuteClock();
	const minutesLeft = Math.max(
		0,
		Math.ceil((new Date(charge.expires_at).getTime() - now) / MINUTE_MS),
	);

	return (
		<>
			{/* Midtrans hands back a QR image; DOKU only a hosted QRIS page. */}
			{charge.qr_image_url ? (
				<>
					<img
						alt="QRIS code"
						className="aspect-square w-full max-w-80 justify-self-center rounded-md bg-white"
						src={charge.qr_image_url}
					/>
					{/* Only the mock gateway sends both: its page stands in for the Customer's phone. */}
					{charge.redirect_url ? (
						<a
							className="justify-self-center text-body text-link"
							href={charge.redirect_url}
							rel="noopener"
							target="_blank"
						>
							Open mock payment page
						</a>
					) : null}
				</>
			) : (
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
					Open QRIS page
				</Button>
			)}
			<div className="flex items-center justify-between gap-4 text-body">
				<span>Waiting for payment…</span>
				<span className="tabular-nums">Expires in {minutesLeft} min</span>
			</div>
		</>
	);
};
