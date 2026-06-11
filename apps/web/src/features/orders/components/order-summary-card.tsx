import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { OrderDetail } from "@/lib/api";
import { formatIDRCurrency } from "@/shared/utils";

interface OrderSummaryCardProps {
	detail: OrderDetail;
}

export const OrderSummaryCard = ({ detail }: OrderSummaryCardProps) => (
	<Card className="mb-4 sm:mb-6">
		<CardContent className="grid gap-4 pt-5 sm:grid-cols-3 sm:gap-6 sm:pt-6">
			<div className="space-y-1.5">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
					Customer
				</p>
				<p className="font-medium leading-snug">
					{detail.customer?.name ?? "—"}
				</p>
				<p className="text-muted-foreground text-sm">
					{detail.customer?.phone_number ?? "—"}
				</p>
			</div>
			<div className="space-y-1.5">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
					Notes
				</p>
				<p className="text-sm leading-relaxed">
					{detail.notes?.trim() ? detail.notes : "—"}
				</p>
			</div>
			<div className="space-y-2">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
					Totals
				</p>
				<dl className="space-y-1.5 text-sm tabular-nums">
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">Subtotal</dt>
						<dd>{formatIDRCurrency(String(detail.total ?? 0))}</dd>
					</div>
					{detail.campaigns.map((row) => (
						<div key={row.id} className="flex justify-between gap-4">
							<dt className="text-muted-foreground">
								{row.campaign?.code ?? "Campaign"}
								{row.campaign?.name ? (
									<span className="text-muted-foreground/70">
										{" "}
										· {row.campaign.name}
									</span>
								) : null}
							</dt>
							<dd>-{formatIDRCurrency(String(row.applied_amount ?? 0))}</dd>
						</div>
					))}
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">Discount total</dt>
						<dd>-{formatIDRCurrency(String(detail.discount ?? 0))}</dd>
					</div>
				</dl>
				<Separator />
				<dl className="space-y-1.5 text-sm tabular-nums">
					<div className="flex justify-between gap-4 font-medium">
						<dt>Net</dt>
						<dd>
							{formatIDRCurrency(
								String(
									Number(detail.total ?? 0) - Number(detail.discount ?? 0),
								),
							)}
						</dd>
					</div>
					{Number(detail.refunded_amount) > 0 ? (
						<div className="text-destructive flex justify-between gap-4">
							<dt>Refunded</dt>
							<dd>-{formatIDRCurrency(String(detail.refunded_amount ?? 0))}</dd>
						</div>
					) : null}
				</dl>
			</div>
		</CardContent>
	</Card>
);
