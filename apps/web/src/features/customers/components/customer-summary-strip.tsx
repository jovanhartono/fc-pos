import { PencilSimpleLineIcon } from "@phosphor-icons/react";
import { CopyValue } from "@/components/copy-value";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import type { CustomerDetail } from "@/features/customers/api";
import { CustomerSheetContent } from "@/features/customers/components/customer-sheet-content";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import dayjs from "@/lib/dayjs";
import { formatMoney } from "@/shared/money";
import { useSheet } from "@/stores/sheet-store";

const KPI_LABELS = [
	"Lifetime spend",
	"Paid orders",
	"Last visit",
	"Complaints",
];

// The strip's own header and cards with the values greyed, so nothing moves
// when the Customer lands.
export const CustomerSummarySkeleton = () => (
	<section aria-hidden className="grid gap-4">
		<header className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid gap-1">
				<h1 className="font-medium text-title-1 tracking-tight">
					<TextSkeleton className="w-48" />
				</h1>
				{/* As tall as the phone number's copy button. */}
				<p className="flex min-h-6 items-center text-body pointer-coarse:min-h-7">
					<TextSkeleton className="w-32" />
				</p>
				{/* As wide as "Customer since … first seen at …", which on a phone
				    pushes Edit onto its own line. */}
				<p className="text-footnote">
					<TextSkeleton className="w-80" />
				</p>
			</div>
			<Button
				disabled
				icon={<PencilSimpleLineIcon className="size-4" />}
				variant="outline"
			>
				Edit
			</Button>
		</header>
		<KpiRow>
			{KPI_LABELS.map((label) => (
				<KpiCard key={label} label={label} value={<TextSkeleton />} />
			))}
		</KpiRow>
	</section>
);

interface CustomerSummaryStripProps {
	customer: CustomerDetail;
}

export const CustomerSummaryStrip = ({
	customer,
}: CustomerSummaryStripProps) => {
	const openSheet = useSheet((s) => s.openSheet);
	const summary = customer.summary;
	const lastVisit = summary.last_visit_at ? dayjs(summary.last_visit_at) : null;

	const handleEdit = () => {
		openSheet({
			title: "Edit customer",
			content: () => <CustomerSheetContent editingCustomer={customer} />,
		});
	};

	return (
		<section className="grid gap-4">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1">
					<h1 className="font-medium text-title-1 tracking-tight">
						{customer.name}
					</h1>
					<p className="flex flex-wrap items-center gap-x-1 text-muted-foreground text-body tabular-nums">
						<CopyValue label="phone number" value={customer.phone_number} />
						{customer.email ? <span>{`· ${customer.email}`}</span> : null}
					</p>
					<p className="text-muted-foreground text-footnote">
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
					info="Paid orders only, minus refunds. Unpaid and cancelled orders are not counted."
					label="Lifetime spend"
					value={formatMoney(summary.lifetime_spend)}
				/>
				<KpiCard label="Paid orders" value={summary.paid_orders} />
				<KpiCard
					label="Last visit"
					value={lastVisit ? lastVisit.format("DD MMM YYYY") : "Never"}
				/>
				<KpiCard label="Complaints" value={summary.complaints} />
			</KpiRow>
		</section>
	);
};
