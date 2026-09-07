import {
	type DerivedItemStatus,
	isCollectableItemStatus,
} from "@fresclean/api/schema";
import { WhatsappLogoIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
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

const STAGES = ["Received", "Cleaning", "QC", "Ready"] as const;

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

// Same map as the POS badges, drawn as a coloured word instead of a chip.
const SERVICE_STATUS_TEXT: Record<string, string> = {
	success: "text-emerald-700",
	danger: "text-rose-700",
	warning: "text-amber-700",
	info: "text-sky-700",
};

interface StatusBlockProps {
	stageIndex: number;
	isCancelled: boolean;
	readyCount: number;
	pendingCount: number;
	pickupCode: string | null;
}

const StatusBlock = ({
	stageIndex,
	isCancelled,
	readyCount,
	pendingCount,
	pickupCode,
}: StatusBlockProps) => {
	const isAllReady = pendingCount > 0 && readyCount === pendingCount;
	const isAllDone = stageIndex >= STAGES.length;

	if (isCancelled) {
		return (
			<section className="border-red-700 border-l-[6px] py-1 pl-4">
				<p className="text-[15px] text-[#0f1a16]">
					Order cancelled. Contact the branch.
				</p>
			</section>
		);
	}

	return (
		<section
			className={cn(
				"grid gap-4 border-l-[6px] py-1 pl-4",
				isAllReady ? "border-emerald-600" : "border-[#0f1a16]",
			)}
		>
			<div className="grid gap-1">
				{isAllDone ? (
					<p className="text-[15px] text-[#0f1a16]">
						Everything has been collected.
					</p>
				) : isAllReady ? (
					<p className="text-[15px] text-[#0f1a16]">
						Show this code at the counter.
					</p>
				) : readyCount > 0 ? (
					<p className="text-[15px] text-[#0f1a16]">
						{readyCount} of {pendingCount} Items done. Collect them now with
						code{" "}
						<span className="font-mono font-bold text-[#0f1a16] tabular-nums">
							{pickupCode}
						</span>
						.
					</p>
				) : (
					<p className="text-[15px] text-[#0f1a16]">
						{pendingCount} {pendingCount === 1 ? "Item" : "Items"} in progress.
					</p>
				)}
			</div>
			{isAllReady && pickupCode ? (
				<p className="font-mono text-3xl font-bold tracking-[0.25em] text-[#0f1a16] tabular-nums">
					{pickupCode}
				</p>
			) : null}
			<ol className="grid grid-cols-4 gap-1.5">
				{STAGES.map((label, index) => {
					const isActive = isAllDone || isAllReady || stageIndex >= index;
					return (
						<li key={label} className="grid gap-1.5">
							<span
								className={cn(
									"h-1.5",
									isActive
										? isAllReady
											? "bg-emerald-600"
											: "bg-[#0f1a16]"
										: "bg-[#0f1a16]/15",
								)}
							/>
							<span
								className={cn(
									"font-mono text-[10px] uppercase tracking-[0.18em]",
									isActive ? "text-[#0f1a16]" : "text-[#2a2922]/50",
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

// Same footprint as the loaded card so a link opened straight from WhatsApp
// does not flash the search form before the order appears.
const StatusPlaceholder = () => (
	<div className="grid gap-8" aria-busy="true">
		<section className="grid gap-4 border-[#0f1a16]/20 border-l-[6px] py-1 pl-4">
			<div className="grid gap-2">
				<span className="h-6 w-28 animate-pulse bg-[#0f1a16]/10" />
				<span className="h-4 w-56 animate-pulse bg-[#0f1a16]/10" />
			</div>
			<ol className="grid grid-cols-4 gap-1.5">
				{STAGES.map((label) => (
					<li key={label} className="grid gap-1.5">
						<span className="h-1.5 bg-[#0f1a16]/10" />
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#2a2922]/50">
							{label}
						</span>
					</li>
				))}
			</ol>
		</section>
		<section className="grid gap-2">
			<span className="h-6 w-44 animate-pulse bg-[#0f1a16]/10" />
			<span className="h-4 w-60 animate-pulse bg-[#0f1a16]/10" />
			<span className="h-4 w-32 animate-pulse bg-[#0f1a16]/10" />
		</section>
	</div>
);

const LABEL_CLASS =
	"font-mono text-[11px] uppercase tracking-[0.18em] text-[#2a2922]/70";
const INPUT_CLASS =
	"rounded-none border-[#0f1a16]/25 bg-white font-mono text-sm focus-visible:border-[#0f1a16] focus-visible:ring-0";

const TrackOrderPage = () => {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();
	const [code, setCode] = useState(search.code ?? "");
	const [phone, setPhone] = useState(search.phone ?? "");
	const [formError, setFormError] = useState<string | null>(null);
	// The URL is the source of truth for which order is open, so Back after
	// "Track another" brings the order straight back.
	const submitted =
		search.code && search.phone
			? { code: search.code, phone: normalizePhoneNumber(search.phone) }
			: null;

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
		void navigate({ search: { code: trimmedCode, phone: trimmedPhone } });
	};

	const handleReset = () => {
		queryClient.removeQueries({ queryKey: ["publicTrackOrder"] });
		setCode("");
		setPhone("");
		void navigate({ search: {} });
	};

	const trackData = trackQuery.data;
	const isLoading = trackQuery.isFetching;

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
		<div className="flex min-h-dvh flex-col bg-white text-[#2a2922]">
			<header className="border-b border-[#0f1a16]/10">
				<div className="mx-auto max-w-xl px-5 py-4">
					<p className="font-bold text-[13px] tracking-[0.18em] text-[#0f1a16]">
						FRESCLEAN
					</p>
				</div>
			</header>

			<main className="mx-auto w-full max-w-xl flex-1 px-5 py-8">
				{submitted && trackQuery.isPending ? (
					<StatusPlaceholder />
				) : trackData ? (
					<div className="grid gap-8">
						<StatusBlock
							stageIndex={getStageIndex(items)}
							isCancelled={trackData.status === "cancelled"}
							readyCount={readyCount}
							pendingCount={pendingItems.length}
							pickupCode={trackData.pickup_code}
						/>

						<section className="grid gap-1">
							<h1 className="font-mono text-xl font-semibold tracking-tight text-[#0f1a16]">
								{trackData.code}
							</h1>
							<p className="text-[15px] text-[#0f1a16]">
								{trackData.customer.name} ·{" "}
								<span className="font-mono">{submitted?.phone}</span>
							</p>
							<p className="text-sm text-[#2a2922]/80">
								{trackData.store.name}
							</p>
						</section>

						<section className="grid gap-3">
							<h2 className={LABEL_CLASS}>Items · {items.length}</h2>
							{/* One block per object handed over, its treatments beneath
							    (ADR-0017): "your shoe: clean done, repaint in progress",
							    never the same shoe listed three times. */}
							<ul className="grid">
								{items.map((item) => (
									<li
										key={item.id}
										className="grid gap-2 border-t border-[#0f1a16]/15 py-4"
									>
										<p className="font-semibold text-[15px] text-[#0f1a16]">
											{formatOrderServiceItemDetails(item)}
										</p>
										<ul className="grid gap-1.5 text-sm">
											{item.services.map((service) => (
												<li
													key={service.id}
													className="flex items-center justify-between gap-3"
												>
													<span className="min-w-0 text-[#0f1a16]">
														{service.service?.name ?? "Service"}
													</span>
													<span
														className={cn(
															"shrink-0",
															SERVICE_STATUS_TEXT[
																getOrderServiceStatusBadgeVariant(
																	service.status,
																)
															] ?? "text-[#2a2922]/80",
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
						</section>

						<div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#0f1a16]/15 pt-6">
							<a
								href={
									storePhoneE164
										? `https://wa.me/${storePhoneE164}`
										: HELP_WHATSAPP
								}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-2 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
							>
								<WhatsappLogoIcon className="size-4" weight="fill" />
								WhatsApp {trackData.store.name}
							</a>
							<button
								type="button"
								onClick={handleReset}
								className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#0f1a16] underline-offset-4 hover:underline"
							>
								Track another
							</button>
						</div>
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
								placeholder="#ABC/06032026/1"
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
