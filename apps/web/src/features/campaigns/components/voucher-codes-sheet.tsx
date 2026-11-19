import {
  Copy01Icon,
  Download04Icon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { campaignsQueries } from "@/features/campaigns/api";
import type { VoucherCode } from "@/features/campaigns/api";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";
import { cn } from "@/lib/utils";

interface VoucherCodesSheetProps {
  campaignCode: string;
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

// The admin hands this file to a print shop. A real .xlsx keeps each code as
// text: a CSV would let Excel read a code like 234E5678 as a number.
const downloadCodes = async (campaignCode: string, codes: VoucherCode[]) => {
  try {
    const { default: writeExcelFile } =
      await import("write-excel-file/browser");
    await writeExcelFile(codes, {
      columns: [
        {
          cell: (code) => code.code,
          header: { fontWeight: "bold", value: "Code" },
          width: 14,
        },
        {
          cell: (code) =>
            code.redeemed_at &&
            dayjs(code.redeemed_at).tz(JAKARTA_TZ).format("D MMM YYYY"),
          header: { fontWeight: "bold", value: "Redeemed" },
          width: 14,
        },
      ],
    }).toFile(`voucher-codes-${campaignCode}.xlsx`);
  } catch {
    toast.error("Couldn't download codes");
  }
};

// Unused is how every code starts, so only a redeemed one carries a badge.
const VoucherCodeRow = ({ code }: VoucherCodeRowProps) => (
  <li className="flex items-center justify-between gap-2 px-3 py-2">
    <span className="min-w-0 text-body break-all tabular-nums">
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

export const VoucherCodesSheet = ({
  campaignCode,
  campaignId,
}: VoucherCodesSheetProps) => {
  const { data, isLoading, isError } = useQuery(
    campaignsQueries.voucherCodes(campaignId)
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (codes: VoucherCode[]) => {
    setIsDownloading(true);
    await downloadCodes(campaignCode, codes);
    setIsDownloading(false);
  };

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
      <p className="text-body text-muted-foreground">
        Couldn&apos;t load codes.
      </p>
    );
  }

  if (data.codes.length === 0) {
    return <EmptyState icon={Ticket01Icon}>No codes yet</EmptyState>;
  }

  const isAllRedeemed = data.redeemed === data.total;

  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body font-medium tabular-nums">
            {data.redeemed}/{data.total} redeemed
          </span>
          <Button
            icon={<HugeiconsIcon icon={Download04Icon} />}
            loading={isDownloading}
            onClick={() => handleDownload(data.codes)}
            type="button"
            variant="outline"
          >
            Download Excel
          </Button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-soft-bar-track">
          <div
            className={cn(
              "h-full rounded-full",
              isAllRedeemed ? "bg-success" : "bg-primary"
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
