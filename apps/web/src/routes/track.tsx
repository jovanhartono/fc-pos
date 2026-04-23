import {
	ArrowCounterClockwiseIcon,
	CheckCircleIcon,
	PackageIcon,
	PhoneIcon,
	SnowflakeIcon,
	SparkleIcon,
	TShirtIcon,
	WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DetailedError } from "hono/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { trackPublicOrder } from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	formatOrderServiceStatus,
	formatOrderStatus,
	getOrderServiceStatusBadgeVariant,
	getOrderStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const trackSearchSchema = z.object({
	code: z.string().trim().min(1).max(32).optional(),
	phone: z.string().trim().min(1).max(20).optional(),
});

export const Route = createFileRoute("/track")({
	validateSearch: (search) => trackSearchSchema.parse(search),
	component: TrackOrderPage,
});

type OrderStatus =
	| "created"
	| "processing"
	| "ready_for_pickup"
	| "completed"
	| "cancelled";

type Stage = {
	key: "received" | "cleaned" | "qc" | "ready";
	label: string;
	caption: string;
	icon: React.ComponentType<{ className?: string; weight?: "duotone" }>;
};

const STAGES: readonly Stage[] = [
	{
		key: "received",
		label: "Received",
		caption: "Logged at branch",
		icon: PackageIcon,
	},
	{
		key: "cleaned",
		label: "Cleaning",
		caption: "Team in progress",
		icon: SparkleIcon,
	},
	{
		key: "qc",
		label: "Quality check",
		caption: "Final inspection",
		icon: SnowflakeIcon,
	},
	{
		key: "ready",
		label: "Ready",
		caption: "Pickup at counter",
		icon: TShirtIcon,
	},
] as const;

function getStageIndexFromOrderStatus(
	status: OrderStatus,
	serviceStatuses: string[],
): number {
	if (status === "completed") {
		return STAGES.length;
	}
	if (status === "ready_for_pickup") {
		return 3;
	}
	if (status === "processing") {
		if (serviceStatuses.some((s) => s === "quality_check")) {
			return 2;
		}
		return 1;
	}
	return 0;
}

function BrandMark({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<svg
				width="32"
				height="32"
				viewBox="0 0 32 32"
				aria-hidden="true"
				className="shrink-0"
			>
				<title>Fresclean</title>
				<rect width="32" height="32" fill="#0f1a16" />
				<rect
					x="4"
					y="4"
					width="24"
					height="24"
					fill="none"
					stroke="#7bc4a3"
					strokeWidth="1"
				/>
				<text
					x="16"
					y="21"
					textAnchor="middle"
					fontFamily="ui-monospace, SFMono-Regular, monospace"
					fontSize="12"
					fontWeight="700"
					fill="#ffffff"
					letterSpacing="-0.5"
				>
					FC
				</text>
			</svg>
			<div className="leading-none">
				<p className="font-bold text-[13px] tracking-[0.28em] text-[#0f1a16]">
					FRESCLEAN
				</p>
				<p className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em] text-[#2a2922]/50">
					Cleaning & restoration
				</p>
			</div>
		</div>
	);
}

function ProgressIndicator({
	stageIndex,
	isCancelled,
}: {
	stageIndex: number;
	isCancelled: boolean;
}) {
	const isAllDone = !isCancelled && stageIndex >= STAGES.length;
	return (
		<div className="grid gap-5">
			<div className="relative grid grid-cols-4">
				<div className="absolute top-6 left-0 right-0 h-px bg-[#2a2922]/15" />
				<div
					className="absolute top-6 left-0 h-px bg-emerald-500 transition-all duration-500"
					style={{
						width: isCancelled
							? "0%"
							: `${Math.min(100, ((stageIndex - 0.5) / (STAGES.length - 1)) * 100)}%`,
					}}
				/>
				{STAGES.map((stage, index) => {
					const isComplete = !isCancelled && (stageIndex > index || isAllDone);
					const isCurrent = !isCancelled && stageIndex === index && !isAllDone;
					const Icon = stage.icon;
					return (
						<div
							key={stage.key}
							className={cn(
								"relative flex flex-col items-center gap-3 text-center",
								isCancelled && "opacity-35",
							)}
						>
							<span
								className={cn(
									"absolute -top-3 font-mono text-[10px] tracking-[0.18em] tabular-nums",
									isComplete || isCurrent
										? "text-[#0f1a16]"
										: "text-[#2a2922]/35",
								)}
							>
								{String(index + 1).padStart(2, "0")}
							</span>
							<div
								className={cn(
									"relative z-10 flex size-12 items-center justify-center border-2 bg-white transition-all",
									isComplete
										? "border-emerald-600 bg-emerald-600 text-white"
										: isCurrent
											? "border-[#0f1a16] bg-white text-[#0f1a16]"
											: "border-[#2a2922]/20 text-[#2a2922]/35",
								)}
							>
								{isComplete ? (
									<CheckCircleIcon className="size-5" weight="duotone" />
								) : (
									<Icon className="size-5" weight="duotone" />
								)}
								{isCurrent ? (
									<span className="absolute -bottom-1 left-1/2 size-1.5 -translate-x-1/2 bg-[#0f1a16]" />
								) : null}
							</div>
							<div className="grid gap-0.5">
								<p
									className={cn(
										"font-semibold text-[11px] uppercase tracking-[0.14em] sm:text-xs",
										isComplete || isCurrent
											? "text-[#0f1a16]"
											: "text-[#2a2922]/45",
									)}
								>
									{stage.label}
								</p>
								<p
									className={cn(
										"hidden text-[11px] leading-snug sm:block",
										isComplete || isCurrent
											? "text-[#2a2922]/70"
											: "text-[#2a2922]/35",
									)}
								>
									{stage.caption}
								</p>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function TrackOrderPage() {
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
			return { code: search.code, phone: search.phone };
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
		const trimmedPhone = phone.trim();
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

	const trackData = trackQuery.data;
	const isLoading = trackQuery.isFetching;

	const sortedServices = useMemo(() => {
		if (!trackData) {
			return [];
		}
		return [...trackData.services].sort((a, b) => a.id - b.id);
	}, [trackData]);

	const stageIndex = useMemo(() => {
		if (!trackData) {
			return 0;
		}
		return getStageIndexFromOrderStatus(
			trackData.status as OrderStatus,
			sortedServices.map((s) => s.status),
		);
	}, [trackData, sortedServices]);

	const orderStatus = trackData?.status as OrderStatus | undefined;
	const isCancelled = orderStatus === "cancelled";
	const isReady = orderStatus === "ready_for_pickup";

	const storePhoneE164 = trackData?.store.phone_number?.replace(/\D/g, "");

	return (
		<div className="flex min-h-dvh flex-col bg-white text-[#2a2922]">
			<header className="sticky top-0 z-20 border-b border-[#0f1a16]/10 bg-white/95 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
					<BrandMark />
					<a
						href="https://wa.me/6281290033232"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 border border-[#0f1a16]/15 bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-[#0f1a16] transition-colors hover:bg-[#0f1a16] hover:text-white"
					>
						<WhatsappLogoIcon className="size-3.5" weight="duotone" />
						<span className="hidden sm:inline">Help</span>
					</a>
				</div>
			</header>

			<main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
				<section className="grid gap-5 border-b border-[#0f1a16]/10 pb-10">
					<div className="flex items-center gap-3">
						<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-600">
							[ 01 ] Order tracking
						</span>
						<span className="h-px flex-1 bg-[#0f1a16]/15" />
					</div>
					<h1 className="max-w-2xl font-bold text-4xl leading-[1.05] tracking-tight text-[#0f1a16] sm:text-5xl">
						Your essentials,
						<br />
						<span className="italic font-serif font-normal">
							in good hands.
						</span>
					</h1>
					<p className="max-w-md text-sm leading-relaxed text-[#2a2922]/70">
						Live status from drop-off to pickup. Pull up your ticket with the
						order code and the number you used at the counter.
					</p>
				</section>

				<section className="grid gap-5 border-b border-[#0f1a16]/10 py-10">
					<div className="flex items-center gap-3">
						<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#2a2922]/60">
							[ 02 ] Credentials
						</span>
						<span className="h-px flex-1 bg-[#0f1a16]/15" />
					</div>
					<div className="grid gap-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<Field data-invalid={!!formError}>
								<FieldLabel
									htmlFor="track-code"
									className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#2a2922]/70"
								>
									Order code
								</FieldLabel>
								<Input
									id="track-code"
									placeholder="ABC/06032026/1"
									value={code}
									onChange={(event) => setCode(event.target.value)}
									className="h-11 rounded-none border-[#0f1a16]/15 bg-white font-mono text-sm uppercase focus-visible:border-[#0f1a16] focus-visible:ring-0"
								/>
							</Field>
							<Field data-invalid={!!formError}>
								<FieldLabel
									htmlFor="track-phone"
									className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#2a2922]/70"
								>
									WhatsApp number
								</FieldLabel>
								<Input
									id="track-phone"
									placeholder="08123456789"
									value={phone}
									onChange={(event) => setPhone(event.target.value)}
									className="h-11 rounded-none border-[#0f1a16]/15 bg-white font-mono text-sm focus-visible:border-[#0f1a16] focus-visible:ring-0"
								/>
							</Field>
						</div>
						{formError ? (
							<FieldError errors={[{ message: formError }]} />
						) : null}
						<Button
							type="button"
							onClick={handleTrack}
							disabled={isLoading}
							className="h-11 rounded-none bg-[#0f1a16] text-xs font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#2a2922] disabled:opacity-60"
						>
							{isLoading ? "Searching…" : "Track order →"}
						</Button>
					</div>
				</section>

				{trackData ? (
					<>
						<section className="grid gap-6 border-b border-[#0f1a16]/10 py-10">
							<div className="flex items-center gap-3">
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#2a2922]/60">
									[ 03 ] Status
								</span>
								<span className="h-px flex-1 bg-[#0f1a16]/15" />
							</div>

							<div className="grid gap-5 sm:gap-7">
								<div className="grid gap-4 border-b border-[#0f1a16]/10 pb-5 sm:grid-cols-3 sm:gap-6">
									<div className="grid gap-1 sm:col-span-2">
										<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#2a2922]/55">
											Order code
										</p>
										<p className="font-mono text-xl font-semibold tracking-tight text-[#0f1a16]">
											{trackData.code}
										</p>
										<p className="font-mono text-[11px] text-[#2a2922]/55">
											{trackData.customer.phone_number_masked}
										</p>
									</div>
									<div className="grid gap-1 sm:text-right">
										<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#2a2922]/55">
											Branch
										</p>
										<p className="text-sm font-semibold text-[#0f1a16]">
											{trackData.store.name}
										</p>
										<p className="sm:justify-self-end">
											{orderStatus ? (
												<Badge
													variant={getOrderStatusBadgeVariant(orderStatus)}
													className="font-mono text-[10px] uppercase tracking-[0.14em]"
												>
													{formatOrderStatus(orderStatus)}
												</Badge>
											) : (
												<span className="font-mono text-[10px] text-[#2a2922]/55">
													—
												</span>
											)}
										</p>
									</div>
								</div>

								<ProgressIndicator
									stageIndex={stageIndex}
									isCancelled={isCancelled}
								/>

								{isCancelled ? (
									<div className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-[#2a2922]">
										Order cancelled. Contact the branch for details.
									</div>
								) : null}

								{isReady ? (
									<div className="grid gap-3 border-l-2 border-emerald-500 bg-emerald-50 px-4 py-4">
										<p className="text-sm text-emerald-900">
											Ready for pickup. Read the code below to the cashier at
											the counter.
										</p>
										{trackData.pickup_code ? (
											<p className="font-mono text-3xl font-bold tracking-[0.3em] text-emerald-900 tabular-nums">
												{trackData.pickup_code}
											</p>
										) : null}
									</div>
								) : null}
							</div>
						</section>

						<section className="grid gap-6 border-b border-[#0f1a16]/10 py-10">
							<div className="flex items-center gap-3">
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#2a2922]/60">
									[ 04 ] Items ·{" "}
									{String(sortedServices.length).padStart(2, "0")}
								</span>
								<span className="h-px flex-1 bg-[#0f1a16]/15" />
							</div>
							<ul className="grid">
								{sortedServices.map((item, index) => (
									<li
										key={item.id}
										className="grid gap-3 border-t border-[#0f1a16]/10 py-4 text-sm first:border-t-0 first:pt-0 sm:grid-cols-[auto_1fr_auto] sm:items-start sm:gap-6"
									>
										<span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[#2a2922]/50 tabular-nums">
											{String(index + 1).padStart(2, "0")}
										</span>
										<div className="min-w-0 grid gap-1">
											<p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#2a2922]/55">
												{item.item_code ?? `#${item.id}`}
											</p>
											<p className="font-semibold text-[15px] text-[#0f1a16]">
												{item.service?.name ?? "Service"}
											</p>
											<p className="text-xs text-[#2a2922]/65">
												{formatOrderServiceItemDetails(item)}
											</p>
										</div>
										<Badge
											variant={getOrderServiceStatusBadgeVariant(item.status)}
											className="h-fit justify-self-start font-mono text-[10px] uppercase tracking-[0.14em] sm:justify-self-end"
										>
											{formatOrderServiceStatus(item.status)}
										</Badge>
									</li>
								))}
							</ul>
						</section>

						<section className="grid gap-6 border-b border-[#0f1a16]/10 py-10">
							<div className="flex items-center gap-3">
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#2a2922]/60">
									[ 05 ] Support
								</span>
								<span className="h-px flex-1 bg-[#0f1a16]/15" />
							</div>
							<div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
								<div className="grid gap-1">
									<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#2a2922]/55">
										Questions?
									</p>
									<p className="text-sm text-[#2a2922]/80">
										Reach the branch handling your order directly.
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<a
										href={
											storePhoneE164
												? `https://wa.me/${storePhoneE164}`
												: "https://wa.me/6281290033232"
										}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-2 border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-emerald-700"
									>
										<WhatsappLogoIcon className="size-4" weight="duotone" />
										WhatsApp
									</a>
									<a
										href={`tel:${trackData.store.phone_number ?? ""}`}
										className="inline-flex items-center gap-2 border border-[#0f1a16]/15 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#0f1a16] transition-colors hover:bg-[#0f1a16] hover:text-white"
									>
										<PhoneIcon className="size-4" weight="duotone" />
										Call
									</a>
								</div>
							</div>
						</section>

						<div className="pt-8">
							<button
								type="button"
								onClick={() => {
									queryClient.removeQueries({
										queryKey: ["publicTrackOrder"],
									});
									setSubmitted(null);
									setCode("");
									setPhone("");
								}}
								className="inline-flex items-center gap-2 border border-[#0f1a16]/20 bg-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#0f1a16] transition-colors hover:bg-[#0f1a16] hover:text-white"
							>
								<ArrowCounterClockwiseIcon
									className="size-3.5"
									weight="duotone"
								/>
								Track another order
							</button>
						</div>
					</>
				) : (
					<section className="grid gap-6 py-10">
						<div className="flex items-center gap-3">
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#2a2922]/60">
								[ 03 ] How it works
							</span>
							<span className="h-px flex-1 bg-[#0f1a16]/15" />
						</div>
						<div className="py-6 sm:py-8">
							<ProgressIndicator stageIndex={-1} isCancelled={false} />
						</div>
					</section>
				)}
			</main>
		</div>
	);
}
