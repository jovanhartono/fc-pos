import { PencilSimpleLineIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerSheetContent } from "@/features/customers/components/customer-sheet-content";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import type { CustomerDetail } from "@/lib/api";
import dayjs from "@/lib/dayjs";
import { formatIDRCurrency } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

interface CustomerSummaryStripProps {
	customer: CustomerDetail;
}

// The count alone misleads in both directions: 1 of 19 lines is a good
// customer, 1 of 2 is not. ADR-0013 keeps Rework lines out of the denominator.
const formatComplaintRate = (lines: number) => {
	if (lines === 0) {
		return "No treatments yet";
	}
	return `of ${lines} line${lines === 1 ? "" : "s"}`;
};

// Money the shop is still owed. An Order whose Repair has not been inspected
// carries no agreed number, so it is named separately instead of being folded
// into a total that would understate what the customer eventually pays.
const formatOwed = ({
	unpaid_amount,
	unpaid_orders,
	unpriced_orders,
}: CustomerDetail["summary"]) => {
	const priced = unpaid_orders - unpriced_orders;
	const parts: string[] = [];

	// An order that bills nothing — every line cancelled, or free rework only —
	// is still unpaid, but "Rp 0 unpaid" reads as a debt the shop should chase.
	if (priced > 0 && Number(unpaid_amount) > 0) {
		parts.push(
			`${formatIDRCurrency(unpaid_amount)} unpaid on ${priced} order${priced === 1 ? "" : "s"}`,
		);
	}
	if (unpriced_orders > 0) {
		parts.push(`${unpriced_orders} awaiting a repair price`);
	}

	return parts.join(" · ");
};

export const CustomerSummaryStrip = ({
	customer,
}: CustomerSummaryStripProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	const summary = customer.summary;
	const owed = formatOwed(summary);
	const lastVisit = summary.last_visit_at ? dayjs(summary.last_visit_at) : null;

	const handleEdit = () => {
		openSheet({
			title: "Edit Customer",
			content: () => <CustomerSheetContent editingCustomer={customer} />,
		});
	};

	return (
		<section className="grid gap-4">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1">
					<h1 className="font-semibold text-2xl uppercase tracking-tight">
						{customer.name}
					</h1>
					<p className="font-mono text-muted-foreground text-sm tabular-nums">
						{customer.phone_number}
						{customer.email ? ` · ${customer.email}` : ""}
					</p>
					<p className="text-muted-foreground text-xs">
						{`Customer since ${dayjs(customer.created_at).format("DD MMM YYYY")} · first seen at ${customer.originStore?.name ?? "—"}`}
					</p>
				</div>
				<Button
					variant="outline"
					onClick={handleEdit}
					icon={<PencilSimpleLineIcon className="size-4" />}
				>
					Edit
				</Button>
			</header>

			<KpiRow>
				<KpiCard
					label="Lifetime spend"
					value={formatIDRCurrency(summary.lifetime_spend)}
					helper="Paid, net of refunds"
				/>
				<KpiCard
					label="Paid orders"
					value={summary.paid_orders}
					helper={
						summary.unpaid_orders > 0
							? `${summary.unpaid_orders} unpaid`
							: "All paid"
					}
				/>
				<KpiCard
					label="Last visit"
					value={lastVisit ? lastVisit.format("DD MMM YYYY") : "Never"}
					helper={lastVisit?.fromNow()}
				/>
				<KpiCard
					label="Complaints"
					value={summary.complaints}
					helper={formatComplaintRate(summary.service_lines)}
				/>
			</KpiRow>

			{owed ? (
				<Card className="border-destructive/40 bg-destructive/5">
					<CardContent className="flex items-center gap-2 p-4 text-sm">
						<WarningCircleIcon className="size-4 shrink-0" weight="fill" />
						<span>{owed}</span>
					</CardContent>
				</Card>
			) : null}
		</section>
	);
};
