import {
	type DerivedItemStatus,
	isCollectableItemStatus,
	isWaitingQcOnly,
} from "@fresclean/api/rules";
import { normalizePhoneNumber } from "@fresclean/api/schema";
import { Clock01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BrandLogo } from "@/components/brand-logo";
import { PaymentOutcome } from "@/components/payment-outcome";
import { QrisWaiting } from "@/components/qris-waiting";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WaitingLabel } from "@/components/waiting-label";
import { WhatsappIcon } from "@/components/whatsapp-icon";
import {
	type PublicTrackedOrder,
	payTrackedOrder,
	type TrackCharge,
	trackKeys,
	trackQueries,
} from "@/features/track/api";
import { useQrisPng } from "@/features/track/hooks/useQrisPng";
import { formatClock } from "@/lib/dayjs";
import { triggerDownload } from "@/lib/download";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { hasQris, qrisImageSrc } from "@/lib/qris";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";

const trackSearchSchema = z.object({
	code: z.string().trim().min(1).max(32).optional(),
	// The router reads ?phone=628121000107 as a number; a WhatsApp link with
	// the phone in that form must still open the Order.
	phone: z.coerce.string().trim().min(1).max(20).optional(),
});

const HELP_WHATSAPP = "https://wa.me/6281290033232";

interface TrackItem {
	status: DerivedItemStatus;
	services: { status: string }[];
}

const STAGES = ["Received", "Cleaning", "QC", "Ready"] as const;

// The rail follows the Items, not the money. The Order says "completed" for a
// refunded Item still on our rack (ADR-0008), which showed all four stages done
// for a shoe the customer still has to come and get.
function getItemStageIndex(item: TrackItem): number {
	if (isCollectableItemStatus(item.status)) {
		return 3;
	}
	if (item.status === "processing") {
		return isWaitingQcOnly(item.services) ? 2 : 1;
	}
	return 0;
}

// Still in the shop and still owed to the customer.
function isPendingItem(item: TrackItem) {
	return item.status !== "picked_up" && item.status !== "cancelled";
}

// Customers come once for everything, so the rail sits where the slowest
// Item sits. Nothing pending — a products-only Order, or every Item already
// collected — reads as done rather than sitting on "Received".
function getStageIndex(items: TrackItem[]): number {
	const pending = items.filter(isPendingItem);
	if (pending.length === 0) {
		return STAGES.length;
	}
	return Math.min(...pending.map(getItemStageIndex));
}

// Same map as the POS badges, drawn as a coloured word instead of a chip.
const SERVICE_STATUS_TEXT: Record<string, string> = {
	success: "text-tone-good-foreground",
	danger: "text-tone-bad-foreground",
	warning: "text-tone-warn-foreground",
	info: "text-tone-info-foreground",
};

const CARD_CLASS = "rounded-lg bg-card shadow-[0_1px_3px_rgb(0_0_0/0.05)]";
const SECTION_LABEL_CLASS = "-mb-3 mx-4 text-subhead text-muted-foreground";
const FIELD_INPUT_CLASS =
	"h-auto pointer-coarse:h-auto rounded-none border-0 bg-transparent px-0 py-0.5 text-title-3 pointer-coarse:text-title-3 tabular-nums placeholder:text-muted-foreground/50 focus-visible:ring-0 dark:bg-transparent";

interface StatusCardProps {
	stageIndex: number;
	isCancelled: boolean;
	readyCount: number;
	pendingCount: number;
	pickupCode: string | null;
}

const StatusCard = ({
	stageIndex,
	isCancelled,
	readyCount,
	pendingCount,
	pickupCode,
}: StatusCardProps) => {
	const isAllReady = pendingCount > 0 && readyCount === pendingCount;
	const isAllDone = stageIndex >= STAGES.length;

	if (isCancelled) {
		return (
			<section className={cn(CARD_CLASS, "p-4")}>
				<p className="font-medium text-headline text-tone-bad-foreground">
					Order cancelled. Contact the store.
				</p>
			</section>
		);
	}

	return (
		<section className={cn(CARD_CLASS, "p-4")}>
			{isAllDone ? (
				<p className="text-headline">Everything has been collected.</p>
			) : isAllReady ? (
				<p className="text-headline">Show this code at the counter.</p>
			) : readyCount > 0 ? (
				<p className="text-headline">
					{readyCount} of {pendingCount} Items done. Collect them now with code{" "}
					<span className="font-bold tabular-nums">{pickupCode}</span>.
				</p>
			) : (
				<p className="text-headline">
					{pluralize(pendingCount, "Item")} in progress.
				</p>
			)}
			{isAllReady && pickupCode ? (
				<p className="mt-2.5 mb-0.5 font-bold text-large-title tracking-[0.12em] tabular-nums">
					{pickupCode}
				</p>
			) : null}
			<ol className="mt-4 grid grid-cols-4 gap-1.5">
				{STAGES.map((label, index) => {
					const isActive = isAllDone || isAllReady || stageIndex >= index;
					return (
						<li key={label} className="grid gap-1.5">
							<span
								className={cn(
									"h-1.5 rounded-full",
									isActive
										? isAllReady
											? "bg-success"
											: "bg-primary"
										: "bg-soft-bar-track",
								)}
							/>
							<span
								className={cn(
									"text-footnote",
									isActive ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{label}
							</span>
						</li>
					);
				})}
			</ol>
		</section>
	);
};

// The server's reason, like nothing left to pay, beats a retry that can't help.
const payErrorText = (error: Error) => {
	const detail =
		error instanceof DetailedError
			? (error.detail as { data?: { message?: string } } | undefined)
			: undefined;
	return detail?.data?.message ?? "Couldn't create the QRIS. Try again.";
};

const PRIMARY_BUTTON_CLASS =
	"h-12 pointer-coarse:h-12 w-full rounded-full bg-primary font-semibold text-headline text-primary-foreground";

interface PaidCardProps {
	amount: number;
}

// Only on the phone that showed the QR: a paid Order opened later just drops
// the card, as before.
const PaidCard = ({ amount }: PaidCardProps) => (
	<section className={cn(CARD_CLASS, "p-4")}>
		<PaymentOutcome
			icon={Tick02Icon}
			isCompact
			text={`${formatMoney(amount)} · Thank you`}
			title="Payment Received"
			tone="good"
		/>
	</section>
);

interface QrisPanelProps {
	charge: TrackCharge;
	code: string;
	src: string;
}

const QrisPanel = ({ charge, code, src }: QrisPanelProps) => {
	const fileName = `QRIS ${code.replace(/[^A-Za-z0-9-]+/g, "-")}.png`;
	const png = useQrisPng(src, fileName);

	const handleSave = async () => {
		if (png && navigator.canShare?.({ files: [png.file] })) {
			// Cancelling the share sheet is fine; the QR is still on screen.
			await navigator.share({ files: [png.file] }).catch(() => undefined);
			return;
		}
		triggerDownload(png?.url ?? src, fileName);
	};

	return (
		<>
			<img
				alt="QRIS"
				className="aspect-square w-full max-w-58 justify-self-center rounded-md border bg-white p-3"
				src={png?.url ?? src}
			/>
			<Button
				className={PRIMARY_BUTTON_CLASS}
				onClick={handleSave}
				type="button"
			>
				Save QRIS
			</Button>
			<p className="text-balance text-center text-muted-foreground text-subhead">
				Open your bank or e-wallet app, tap Scan, and choose this QRIS from your
				photos.
			</p>
			<QrisWaiting
				expiresAt={charge.expires_at}
				mockPageUrl={charge.redirect_url}
			/>
		</>
	);
};

interface PaymentCardProps {
	code: string;
	phone: string;
	netDue: number;
	openCharge: TrackCharge | null;
	// The QR this phone showed ran out unpaid.
	hasExpired: boolean;
}

const PaymentCard = ({
	code,
	phone,
	netDue,
	openCharge,
	hasExpired,
}: PaymentCardProps) => {
	const queryClient = useQueryClient();
	const payMutation = useMutation({
		mutationFn: () => payTrackedOrder({ code, phone_number: phone }),
		onSuccess: (charge) => {
			if (!hasQris(charge) && charge.redirect_url) {
				window.location.href = charge.redirect_url;
				return;
			}
			queryClient.setQueryData(
				trackKeys.order(code, phone),
				(order: PublicTrackedOrder | undefined) =>
					order && { ...order, open_charge: charge },
			);
			payMutation.reset();
		},
		// Said under the button instead.
		onError: () => undefined,
	});
	const resetPay = payMutation.reset;

	// A Customer who backs out of DOKU's QRIS page lands on this page as Safari
	// left it, the button still spinning, so free it and read the Order again.
	useEffect(() => {
		const handlePageShow = (event: PageTransitionEvent) => {
			if (!event.persisted) {
				return;
			}
			resetPay();
			void queryClient.invalidateQueries({ queryKey: trackKeys.all });
		};
		window.addEventListener("pageshow", handlePageShow);
		return () => window.removeEventListener("pageshow", handlePageShow);
	}, [queryClient, resetPay]);

	const qrSrc = useMemo(
		() => (openCharge ? qrisImageSrc(openCharge) : null),
		[openCharge],
	);
	const isPaying = payMutation.isPending || payMutation.isSuccess;
	const payError = payMutation.isError ? (
		<p
			className="text-balance text-center text-destructive text-subhead"
			role="alert"
		>
			{payErrorText(payMutation.error)}
		</p>
	) : null;

	if (hasExpired && !openCharge) {
		return (
			<section className={cn(CARD_CLASS, "grid gap-3.5 p-4")}>
				<PaymentOutcome
					icon={Clock01Icon}
					isCompact
					text="Nothing was charged."
					title="QRIS Expired"
					tone="neutral"
				/>
				<Button
					className={PRIMARY_BUTTON_CLASS}
					loading={isPaying}
					loadingText="Creating QRIS…"
					onClick={() => payMutation.mutate()}
					type="button"
				>
					New QRIS
				</Button>
				{payError}
			</section>
		);
	}

	return (
		<section className={cn(CARD_CLASS, "grid gap-3.5 p-4")}>
			<div className="flex items-baseline justify-between gap-3">
				<p className="text-headline">Amount due</p>
				<p className="font-medium text-title-3 tabular-nums">
					{formatMoney(netDue)}
				</p>
			</div>
			{openCharge && qrSrc ? (
				<QrisPanel charge={openCharge} code={code} src={qrSrc} />
			) : (
				<>
					{/* DOKU's QRIS page the Customer left unpaid, while its SNAP keys are missing. */}
					{openCharge ? (
						<div className="grid gap-0.5 rounded-lg bg-muted px-3.5 py-3 text-body">
							<WaitingLabel>Payment not finished</WaitingLabel>
							<span className="pl-4 text-muted-foreground text-subhead tabular-nums">
								Open until {formatClock(openCharge.expires_at)}
							</span>
						</div>
					) : null}
					<Button
						className={PRIMARY_BUTTON_CLASS}
						loading={isPaying}
						loadingText="Creating QRIS…"
						onClick={() => payMutation.mutate()}
						type="button"
					>
						{openCharge ? "Continue Payment" : "Pay with QRIS"}
					</Button>
					{payError}
				</>
			)}
		</section>
	);
};

// Same structure as the loaded page so a link opened straight from WhatsApp
// does not flash the search form or jump when the Order appears.
const StatusPlaceholder = () => (
	<div className="grid gap-5" aria-busy="true">
		<div className="px-1 pt-1">
			<p className="font-bold text-title-1 leading-tight">
				<TextSkeleton className="w-56" />
			</p>
			<p className="mt-0.5 text-headline">
				<TextSkeleton className="w-48" />
			</p>
		</div>
		<section className={cn(CARD_CLASS, "p-4")}>
			<p className="text-headline">
				<TextSkeleton className="w-40" />
			</p>
			<ol className="mt-4 grid grid-cols-4 gap-1.5">
				{STAGES.map((label) => (
					<li key={label} className="grid gap-1.5">
						<span className="h-1.5 rounded-full bg-soft-bar-track" />
						<span className="text-muted-foreground text-footnote">{label}</span>
					</li>
				))}
			</ol>
		</section>
		<p className={SECTION_LABEL_CLASS}>Items</p>
		<section className={CARD_CLASS}>
			<div className="ml-4 grid gap-1.5 py-3 pr-4">
				<p className="font-medium text-headline">
					<TextSkeleton className="w-52" />
				</p>
				<p className="text-body">
					<TextSkeleton className="w-40" />
				</p>
			</div>
		</section>
	</div>
);

const TrackOrderPage = () => {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();
	const [code, setCode] = useState(search.code ?? "");
	const [phone, setPhone] = useState(search.phone ?? "");
	const [formError, setFormError] = useState<string | null>(null);
	// The URL decides which Order is open, so Back after "Track another" brings
	// the Order straight back.
	const submitted =
		search.code && search.phone
			? { code: search.code, phone: normalizePhoneNumber(search.phone) }
			: null;

	const trackQuery = useQuery({
		...trackQueries.order(submitted?.code, submitted?.phone),
		enabled: !!submitted,
	});

	useEffect(() => {
		const error = trackQuery.error;
		if (!error) {
			return;
		}
		if (error instanceof DetailedError) {
			const details = error.detail as
				| { data?: { message?: string } }
				| undefined;
			toast.error(details?.data?.message ?? "Something went wrong");
			return;
		}
		if (error instanceof Error) {
			toast.error(error.message);
		}
	}, [trackQuery.error]);

	const handleTrack = () => {
		const trimmedCode = code.trim();
		// Customers type 0812…, +62 812…, or +62 0812…; the shop stores +62812….
		const trimmedPhone = normalizePhoneNumber(phone);
		if (!trimmedCode || !trimmedPhone) {
			setFormError("Order code and WhatsApp number are required");
			return;
		}
		setFormError(null);
		if (submitted?.code === trimmedCode && submitted?.phone === trimmedPhone) {
			void trackQuery.refetch();
			return;
		}
		setShownCharge(null);
		void navigate({ search: { code: trimmedCode, phone: trimmedPhone } });
	};

	const handleReset = () => {
		queryClient.removeQueries({ queryKey: trackKeys.all });
		setShownCharge(null);
		setCode("");
		setPhone("");
		void navigate({ search: {} });
	};

	const trackData = trackQuery.data;
	const isLoading = trackQuery.isFetching;

	// The last QR this phone showed, so the card can still say Paid or Expired
	// once the server stops sending it.
	const [shownCharge, setShownCharge] = useState<TrackCharge | null>(null);
	const openCharge = trackData?.open_charge ?? null;
	if (
		hasQris(openCharge) &&
		openCharge?.expires_at !== shownCharge?.expires_at
	) {
		setShownCharge(openCharge);
	}
	const isPaidHere =
		trackData?.payment_status === "paid" && shownCharge !== null;
	// The gateway's clock, not the phone's, says when a QR ends: gone while the
	// amount stayed the same means it ran out.
	const hasExpired =
		shownCharge !== null &&
		!hasQris(openCharge) &&
		shownCharge.amount === trackData?.net_due;

	useEffect(() => {
		document.title = trackData
			? `${trackData.code} · Order Tracking | Fresclean`
			: "Order Tracking | Fresclean";
	}, [trackData]);
	const items = trackData?.items ?? [];
	const pendingItems = items.filter(isPendingItem);
	// Same predicate the server gates pickup_code on, so the code never shows
	// without a collectable Item behind it.
	const readyCount = pendingItems.filter((item) =>
		isCollectableItemStatus(item.status),
	).length;
	const storePhoneE164 = trackData?.store.phone_number?.replace(/\D/g, "");

	return (
		<div className="flex min-h-dvh flex-col bg-muted text-foreground">
			<header className="sticky top-0 z-10 bg-frost shadow-[0_0.5px_0_var(--border)] backdrop-blur-xl backdrop-saturate-150">
				<div className="mx-auto max-w-md px-5 py-2.5">
					<BrandLogo className="h-8" />
				</div>
			</header>

			<main className="mx-auto w-full max-w-md flex-1 px-4 pt-5 pb-8">
				{submitted && trackQuery.isPending ? (
					<StatusPlaceholder />
				) : trackData ? (
					<div className="grid gap-5">
						<div className="px-1 pt-1">
							<h1 className="font-bold text-title-1 leading-tight tabular-nums">
								{trackData.code}
							</h1>
							<p className="mt-0.5 text-headline">
								{trackData.customer.name} ·{" "}
								<span className="tabular-nums">{submitted?.phone}</span>
							</p>
						</div>

						<StatusCard
							stageIndex={getStageIndex(items)}
							isCancelled={trackData.status === "cancelled"}
							readyCount={readyCount}
							pendingCount={pendingItems.length}
							pickupCode={trackData.pickup_code}
						/>

						{isPaidHere ? <PaidCard amount={shownCharge.amount} /> : null}
						{trackData.can_pay_online && submitted ? (
							<PaymentCard
								code={submitted.code}
								hasExpired={hasExpired}
								netDue={trackData.net_due}
								openCharge={openCharge}
								phone={submitted.phone}
							/>
						) : null}

						<h2 className={SECTION_LABEL_CLASS}>Items · {items.length}</h2>
						{/* One block per Item handed over, its Services beneath
						    (ADR-0017): "your shoe: clean done, repaint in progress",
						    never the same shoe listed three times. */}
						<ul className={CARD_CLASS}>
							{items.map((item) => (
								<li
									key={item.id}
									className="ml-4 grid gap-1.5 border-border py-3 pr-4 not-first:border-t"
								>
									<p className="font-medium text-headline">
										{formatOrderServiceItemDetails(item)}
									</p>
									<ul className="grid gap-1.5 text-body">
										{item.services.map((service) => (
											<li
												key={service.id}
												className="flex justify-between gap-3"
											>
												<span className="min-w-0 text-balance">
													{service.service?.name ?? "Service"}
												</span>
												<span
													className={cn(
														"shrink-0 font-medium",
														SERVICE_STATUS_TEXT[
															getOrderServiceStatusBadgeVariant(service.status)
														] ?? "text-muted-foreground",
													)}
												>
													{formatOrderServiceStatus(service.status)}
												</span>
											</li>
										))}
									</ul>
								</li>
							))}
						</ul>

						<h2 className={SECTION_LABEL_CLASS}>Store</h2>
						<section className={cn(CARD_CLASS, "grid gap-3.5 p-4")}>
							<p className="font-medium">{trackData.store.name}</p>
							<a
								href={
									storePhoneE164
										? `https://wa.me/${storePhoneE164}`
										: HELP_WHATSAPP
								}
								target="_blank"
								rel="noreferrer"
								className="flex h-12 items-center justify-center gap-2 rounded-full bg-whatsapp font-semibold text-headline text-white"
							>
								<HugeiconsIcon icon={WhatsappIcon} className="size-[18px]" />
								WhatsApp
							</a>
						</section>

						<button
							type="button"
							onClick={handleReset}
							className="justify-self-center p-2 text-headline text-link"
						>
							Track Another Order
						</button>
					</div>
				) : (
					<form
						className="grid gap-5"
						onSubmit={(event) => {
							event.preventDefault();
							handleTrack();
						}}
					>
						<h1 className="mx-1 mt-1 font-bold text-title-1 leading-tight">
							Track Order
						</h1>
						<div className={cn(CARD_CLASS, "overflow-hidden")}>
							<Field
								data-invalid={!!formError}
								className="ml-4 w-auto gap-0.5 py-2.5 pr-4"
							>
								<FieldLabel
									htmlFor="track-code"
									className="text-muted-foreground text-footnote"
								>
									Order code
								</FieldLabel>
								<Input
									id="track-code"
									placeholder="#KMG/19102026/2"
									value={code}
									onChange={(event) => setCode(event.target.value)}
									className={cn(FIELD_INPUT_CLASS, "uppercase")}
								/>
							</Field>
							<Field
								data-invalid={!!formError}
								className="ml-4 w-auto gap-0.5 border-border border-t py-2.5 pr-4"
							>
								<FieldLabel
									htmlFor="track-phone"
									className="text-muted-foreground text-footnote"
								>
									WhatsApp number
								</FieldLabel>
								<Input
									id="track-phone"
									type="tel"
									inputMode="tel"
									placeholder="0812 3456 789"
									value={phone}
									onChange={(event) => setPhone(event.target.value)}
									className={FIELD_INPUT_CLASS}
								/>
							</Field>
						</div>
						{formError ? (
							<FieldError errors={[{ message: formError }]} />
						) : null}
						<Button
							type="submit"
							disabled={isLoading}
							className={PRIMARY_BUTTON_CLASS}
						>
							{isLoading ? "Searching…" : "Track"}
						</Button>
					</form>
				)}
			</main>
		</div>
	);
};

export const Route = createFileRoute("/track")({
	validateSearch: (search) => trackSearchSchema.parse(search),
	component: TrackOrderPage,
});
