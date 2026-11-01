import { Copy01Icon, Ticket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { campaignsQueries, type VoucherCode } from "@/features/campaigns/api";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";

interface VoucherCodesSheetProps {
	campaignId: number;
}

interface VoucherCodeRowProps {
	code: VoucherCode;
}

const handleCopyCode = async (code: string) => {
	try {
		await navigator.clipboard.writeText(code);
		toast.success("Code copied", { description: code });
	} catch {
		toast.error("Couldn't copy code");
	}
};

// Unused is how every code starts, so only a redeemed one carries a badge.
const VoucherCodeRow = ({ code }: VoucherCodeRowProps) => (
	<li className="flex items-center justify-between gap-2 px-3 py-2">
		<span className="min-w-0 break-all text-body tabular-nums">
			{code.code}
		</span>
		<div className="flex shrink-0 items-center gap-2">
			{code.redeemed_at === null ? null : (
				<Badge variant="secondary">
					Redeemed {dayjs(code.redeemed_at).format("D MMM")}
				</Badge>
			)}
			<Button
				aria-label={`Copy code ${code.code}`}
				icon={<HugeiconsIcon icon={Copy01Icon} className="size-4" />}
				onClick={() => handleCopyCode(code.code)}
				size="icon"
				type="button"
				variant="ghost"
			/>
		</div>
	</li>
);

export const VoucherCodesSheet = ({ campaignId }: VoucherCodesSheetProps) => {
	const { data, isLoading, isError } = useQuery(
		campaignsQueries.voucherCodes(campaignId),
	);

	if (isLoading) {
		return (
			<div className="grid gap-2">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-40 w-full" />
			</div>
		);
	}

	if (isError || !data) {
		return (
			<p className="text-muted-foreground text-body">Couldn't load codes.</p>
		);
	}

	if (data.codes.length === 0) {
		return <EmptyState icon={Ticket01Icon}>No codes yet</EmptyState>;
	}

	const isAllRedeemed = data.redeemed === data.total;

	return (
		<div className="grid gap-4">
			<header className="grid gap-2">
				<span className="font-medium text-body tabular-nums">
					{data.redeemed}/{data.total} redeemed
				</span>
				<div className="h-1.5 overflow-hidden rounded-full bg-soft-bar-track">
					<div
						className={cn(
							"h-full rounded-full",
							isAllRedeemed ? "bg-success" : "bg-primary",
						)}
						style={{
							width: `${data.total ? (data.redeemed / data.total) * 100 : 0}%`,
						}}
					/>
				</div>
			</header>

			<ul className="divide-y overflow-hidden rounded-lg border bg-card">
				{data.codes.map((code) => (
					<VoucherCodeRow code={code} key={code.id} />
				))}
			</ul>
		</div>
	);
};
