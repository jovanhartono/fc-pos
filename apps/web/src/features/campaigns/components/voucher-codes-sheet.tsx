import { CopyIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { VoucherCode } from "@/lib/api";
import { campaignVoucherCodesQueryOptions } from "@/lib/query-options";

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
		toast.error("Failed to copy code");
	}
};

const VoucherCodeRow = ({ code }: VoucherCodeRowProps) => {
	const isRedeemed = code.redeemed_at !== null;

	return (
		<li className="flex items-center justify-between gap-2 border-b px-1 py-2 last:border-b-0">
			<span className="min-w-0 break-all font-mono text-sm">{code.code}</span>
			<div className="flex shrink-0 items-center gap-2">
				<Badge variant={isRedeemed ? "secondary" : "outline-success"}>
					{isRedeemed ? "Redeemed" : "Available"}
				</Badge>
				<Button
					aria-label={`Copy code ${code.code}`}
					icon={<CopyIcon className="size-4" />}
					onClick={() => handleCopyCode(code.code)}
					size="icon"
					type="button"
					variant="ghost"
				/>
			</div>
		</li>
	);
};

export const VoucherCodesSheet = ({ campaignId }: VoucherCodesSheetProps) => {
	const { data, isLoading, isError } = useQuery(
		campaignVoucherCodesQueryOptions(campaignId),
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
			<p className="text-muted-foreground text-sm">Failed to load codes.</p>
		);
	}

	if (data.codes.length === 0) {
		return <p className="text-muted-foreground text-sm">No codes minted.</p>;
	}

	return (
		<div className="grid gap-4">
			<header className="flex items-baseline gap-2 text-sm">
				<span className="font-medium tabular-nums">
					{data.redeemed} of {data.total} redeemed
				</span>
				<span className="text-muted-foreground tabular-nums">
					{data.remaining} remaining
				</span>
			</header>

			<ul className="border">
				{data.codes.map((code) => (
					<VoucherCodeRow code={code} key={code.id} />
				))}
			</ul>
		</div>
	);
};
