import {
	type DerivedItemStatus,
	isCollectableItemStatus,
} from "@fresclean/api/schema";
import { WhatsappLogoIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { trackPublicOrder } from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { normalizePhoneNumber } from "@/lib/phone-number";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const trackSearchSchema = z.object({
	code: z.string().trim().min(1).max(32).optional(),
	phone: z.string().trim().min(1).max(20).optional(),
});

const HELP_WHATSAPP = "https://wa.me/6281290033232";

interface TrackItem {
	status: DerivedItemStatus;
	services: { status: string }[];
}

const STAGES = [
	{ label: "Received", current: "Logged" },
	{ label: "Cleaning", current: "In progress" },
	{ label: "QC", current: "Being inspected" },
	{ label: "Ready", current: "At counter" },
] as const;

// The rail follows the objects, not the money. The Order rollup says
// "completed" for a refunded pair still on our rack (ADR-0008 — the money is
// settled), and reading it here painted all four stages done for a shoe the
// customer still has to come and get.
function getItemStageIndex(item: TrackItem): number {
	if (isCollectableItemStatus(item.status)) {
		return 3;
	}
	if (item.status === "processing") {
		return item.services.some((service) => service.status === "quality_check")
			? 2
			: 1;
	}
	return 0;
}

// Still in the shop and still owed to the customer.
function isPendingItem(item: TrackItem) {
	return item.status !== "picked_up" && item.status !== "cancelled";
}

// Customers come once for everything, so the rail sits where the slowest
// Item sits. Nothing pending — a products-only order, or every object already
// collected — reads as done rather than sitting on "Received".
function getStageIndex(items: TrackItem[]): number {
	const pending = items.filter(isPendingItem);
	if (pending.length === 0) {
		return STAGES.length;
	}
	return Math.min(...pending.map(getItemStageIndex));
}

const BrandMark = () => (
	<p className="font-bold text-[13px] tracking-[0.18em] text-[#0f1a16]">
		FRESCLEAN
	</p>
);

interface StageRailProps {
	stageIndex: number;
	isCancelled: boolean;
}

const StageRail = ({ stageIndex, isCancelled }: StageRailProps) => {
	const isAllDone = !isCancelled && stageIndex >= STAGES.length;
	return (
		<ol className={cn("grid grid-cols-4 gap-1.5", isCancelled && "opacity-35")}>
			{STAGES.map((stage, index) => {
				const isComplete = !isCancelled && (stageIndex > index || isAllDone);
				const isCurrent = !isCancelled && stageIndex === index && !isAllDone;
				const isActive = isComplete || isCurrent;
				return (
					<li key={stage.label} className="grid gap-2">
						<span
							className={cn(
								"h-1",
								isActive
									? "bg-[#0f1a16]"
									: "border-t border-dotted border-[#0f1a16]/30",
								isCurrent && "animate-pulse",
							)}
						/>
						<p
							className={cn(
								"font-mono text-[10px] uppercase tracking-[0.18em]",
								isActive ? "text-[#0f1a16]" : "text-[#2a2922]/40",
								isCurrent && "font-bold",
							)}
						>
							{stage.label}
						</p>
						{isCurrent ? (
							<p className="-mt-1 text-[11px] text-[#2a2922]/70">
								{stage.current}
							</p>
						) : null}
					</li>
				);
			})}
		</ol>
	);
};

const LABEL_CLASS =
	"font-mono text-[10px] uppercase tracking-[0.18em] text-[#2a2922]/55";
const INPUT_CLASS =
	"rounded-none border-[#0f1a16]/15 bg-white font-mono text-sm focus-visible:border-[#0f1a16] focus-visible:ring-0";

const TrackOrderPage = () => {
	const search = Route.useSearch();
	const queryClient = useQueryClient();
	const [code, setCode] = useState(search.code ?? "");
	const [phone, setPhone] = useState(search.phone ?? "");
	const [formError, setFormError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState<{
		code: string;
		phone: string;
	} | null>(() => {
		if (search.code && search.phone) {
			return { code: search.code, phone: normalizePhoneNumber(search.phone) };
		}
		return null;
	});

	const trackQuery = useQuery({
		queryKey: ["publicTrackOrder", submitted?.code, submitted?.phone],
		queryFn: () =>
			trackPublicOrder({
				code: submitted?.code || "",
				phone_number: submitted?.phone || "",
			}),
		enabled: !!submitted,
		retry: false,
		refetchOnWindowFocus: false,
		staleTime: 0,
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
		setSubmitted({ code: trimmedCode, phone: trimmedPhone });
	};

	const handleReset = () => {
		queryClient.removeQueries({ queryKey: ["publicTrackOrder"] });
		setSubmitted(null);
		setCode("");
		setPhone("");
	};

	const trackData = trackQuery.data;
	const isLoading = trackQuery.isFetching;
	const items = trackData?.items ?? [];
	const stageIndex = getStageIndex(items);
	const isCancelled = trackData?.status === "cancelled";
	// Same predicate the server gates pickup_code on, so the code never shows
	// without a collectable Item behind it.
	const pendingItems = items.filter(isPendingItem);
	const readyCount = pendingItems.filter((item) =>
		isCollectableItemStatus(item.status),
	).length;
	const isAllReady =
		pendingItems.length > 0 && readyCount === pendingItems.length;
	const isPartlyReady = readyCount > 0 && !isAllReady;
	const storePhoneE164 = trackData?.store.phone_number?.replace(/\D/g, "");

	return (
		<div className="flex min-h-dvh flex-col bg-white text-[#2a2922]">
			<header className="border-b border-[#0f1a16]/10">
				<div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">
					<BrandMark />
					<a
						href={HELP_WHATSAPP}
						target="_blank"
						rel="noreferrer"
						className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#0f1a16] underline-offset-4 hover:underline"
					>
						Help
					</a>
				</div>
			</header>

			<main className="mx-auto w-full max-w-xl flex-1 px-5 py-10">
				{trackData ? (
					<div className="grid gap-8">
						<section className="grid gap-1">
							<div className="flex items-baseline justify-between gap-4">
								<h1 className="font-mono text-xl font-semibold tracking-tight text-[#0f1a16]">
									{trackData.code}
								</h1>
								<button
									type="button"
									onClick={handleReset}
									className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#0f1a16] underline-offset-4 hover:underline"
								>
									Track another
								</button>
							</div>
							<p className="text-[13px] text-[#2a2922]/70">
								{trackData.store.name} ·{" "}
								<span className="font-mono">
									{trackData.customer.phone_number_masked}
								</span>
							</p>
						</section>

						<StageRail stageIndex={stageIndex} isCancelled={isCancelled} />

						{isCancelled && (
							<p className="border-l-2 border-destructive pl-3 text-sm">
								Cancelled. Contact the branch.
							</p>
						)}

						{isAllReady ? (
							<section className="grid gap-2 border-2 border-[#0f1a16] p-4">
								<h2 className={LABEL_CLASS}>Pickup code</h2>
								{trackData.pickup_code ? (
									<p className="font-mono text-3xl font-bold tracking-[0.3em] text-[#0f1a16] tabular-nums">
										{trackData.pickup_code}
									</p>
								) : null}
								<p className="text-[13px] text-[#2a2922]/70">
									Show this at the counter
								</p>
							</section>
						) : null}

						{isPartlyReady ? (
							<p className="border border-[#0f1a16]/15 px-4 py-3 text-[13px] text-[#2a2922]/80">
								{readyCount} of {pendingItems.length} Items can be collected
								now.
								{trackData.pickup_code ? (
									<>
										{" "}
										Pickup code{" "}
										<span className="font-mono font-semibold text-[#0f1a16]">
											{trackData.pickup_code}
										</span>
									</>
								) : null}
							</p>
						) : null}

						<section className="grid gap-3">
							<h2 className={LABEL_CLASS}>Items · {items.length}</h2>
							{/* One block per object handed over, its treatments beneath
							    (ADR-0017): "your shoe: clean done, repaint in progress",
							    never the same shoe listed three times. */}
							<ul className="grid">
								{items.map((item) => (
									<li
										key={item.id}
										className="grid gap-1.5 border-t border-[#0f1a16]/10 py-4"
									>
										<div className="flex items-start justify-between gap-3">
											<p className={LABEL_CLASS}>{item.item_code}</p>
											<Badge
												variant={getOrderServiceStatusBadgeVariant(item.status)}
												className="font-mono text-[10px] uppercase tracking-[0.18em]"
											>
												{formatOrderServiceStatus(item.status)}
											</Badge>
										</div>
										<p className="font-semibold text-[15px] text-[#0f1a16]">
											{formatOrderServiceItemDetails(item)}
										</p>
										<ul className="grid gap-1 pl-3 text-[13px]">
											{item.services.map((service) => (
												<li
													key={service.id}
													className="flex justify-between gap-3"
												>
													<span className="text-[#2a2922]/80">
														{service.service?.name ?? "Service"}
													</span>
													<span className="text-[#2a2922]/55">
														{formatOrderServiceStatus(service.status)}
													</span>
												</li>
											))}
										</ul>
									</li>
								))}
							</ul>
						</section>

						<a
							href={
								storePhoneE164
									? `https://wa.me/${storePhoneE164}`
									: HELP_WHATSAPP
							}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-2 border-t border-[#0f1a16]/10 pt-6 text-sm text-[#0f1a16] underline-offset-4 hover:underline"
						>
							<WhatsappLogoIcon className="size-4" weight="duotone" />
							WhatsApp {trackData.store.name}
						</a>
					</div>
				) : (
					<form
						className="grid gap-5"
						onSubmit={(event) => {
							event.preventDefault();
							handleTrack();
						}}
					>
						<h1 className="font-semibold text-2xl tracking-tight text-[#0f1a16]">
							Track order
						</h1>
						<Field data-invalid={!!formError}>
							<FieldLabel htmlFor="track-code" className={LABEL_CLASS}>
								Order code
							</FieldLabel>
							<Input
								id="track-code"
								placeholder="ABC/06032026/1"
								value={code}
								onChange={(event) => setCode(event.target.value)}
								className={cn(INPUT_CLASS, "uppercase")}
							/>
						</Field>
						<Field data-invalid={!!formError}>
							<FieldLabel htmlFor="track-phone" className={LABEL_CLASS}>
								WhatsApp number
							</FieldLabel>
							<Input
								id="track-phone"
								type="tel"
								inputMode="tel"
								placeholder="08123456789"
								value={phone}
								onChange={(event) => setPhone(event.target.value)}
								className={INPUT_CLASS}
							/>
						</Field>
						{formError ? (
							<FieldError errors={[{ message: formError }]} />
						) : null}
						<Button
							type="submit"
							disabled={isLoading}
							className="h-10 pointer-coarse:h-11 rounded-none bg-[#0f1a16] text-xs font-semibold uppercase tracking-[0.18em] text-white hover:bg-[#2a2922] disabled:opacity-60"
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
