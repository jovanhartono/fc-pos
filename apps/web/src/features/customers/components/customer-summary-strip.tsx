import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
		<header className="grid gap-1">
			<div className="flex items-start justify-between gap-3">
				<h1 className="pt-0.5 font-medium text-title-1 tracking-tight pointer-coarse:pt-1.5">
					<TextSkeleton className="w-48" />
				</h1>
				<Button
					disabled
					icon={<HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />}
					variant="outline"
				>
					Edit
				</Button>
			</div>
			{/* As tall as the phone number's copy button. */}
			<p className="flex min-h-6 items-center text-body pointer-coarse:min-h-7">
				<TextSkeleton className="w-32" />
			</p>
			<p className="text-footnote">
				<TextSkeleton className="w-80 max-w-full" />
			</p>
		</header>
		<KpiRow isPending>
			{KPI_LABELS.map((label) => (
				<KpiCard key={label} label={label} value={null} />
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
			title: "Edit Customer",
			content: () => <CustomerSheetContent editingCustomer={customer} />,
		});
	};

	return (
		<section className="grid gap-4">
			<header className="grid gap-1">
				<div className="flex items-start justify-between gap-3">
					{/* Centres the name's first line on the Edit button beside it. */}
					<h1 className="min-w-0 wrap-break-word pt-0.5 font-medium text-title-1 tracking-tight pointer-coarse:pt-1.5">
						{customer.name}
					</h1>
					<Button
						variant="outline"
						onClick={handleEdit}
						icon={<HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />}
					>
						Edit
					</Button>
				</div>
				<p className="flex flex-wrap items-center gap-x-1 text-muted-foreground text-body tabular-nums">
					<CopyValue label="phone number" value={customer.phone_number} />
					{customer.email ? <span>{`· ${customer.email}`}</span> : null}
				</p>
				<p className="text-muted-foreground text-footnote">
					{`Customer since ${dayjs(customer.created_at).format("DD MMM YYYY")} · first seen at ${customer.originStore?.name ?? "—"}`}
				</p>
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
