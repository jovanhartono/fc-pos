export interface CampaignDiscountInput {
  discount_type: "fixed" | "percentage";
  discount_value: string;
  max_discount: string | null;
  min_order_total?: string | null;
}

export interface CampaignContribution<T extends CampaignDiscountInput> {
  campaign: T;
  amount: number;
}

export interface StackedDiscount<T extends CampaignDiscountInput> {
  total: number;
  breakdown: CampaignContribution<T>[];
}

export function computeCampaignContribution(
  campaign: CampaignDiscountInput,
  grossTotal: number,
  remaining: number
): number {
  if (remaining <= 0) {
    return 0;
  }

  const minOrderTotal = Number(campaign.min_order_total ?? 0);
  if (grossTotal < minOrderTotal) {
    return 0;
  }

  let contribution =
    campaign.discount_type === "percentage"
      ? (remaining * Number(campaign.discount_value)) / 100
      : Number(campaign.discount_value);

  const maxDiscount =
    campaign.max_discount !== null && campaign.max_discount !== undefined
      ? Number(campaign.max_discount)
      : null;
  if (maxDiscount !== null && maxDiscount > 0) {
    contribution = Math.min(contribution, maxDiscount);
  }
  contribution = Math.min(contribution, remaining);
  return Math.max(0, Math.round(contribution));
}

export function stackCampaignDiscounts<T extends CampaignDiscountInput>(
  grossTotal: number,
  campaigns: T[]
): StackedDiscount<T> {
  const ordered = [...campaigns].sort(
    (a, b) =>
      computeCampaignContribution(b, grossTotal, grossTotal) -
      computeCampaignContribution(a, grossTotal, grossTotal)
  );

  let running = 0;
  const breakdown: CampaignContribution<T>[] = [];

  for (const campaign of ordered) {
    const amount = computeCampaignContribution(
      campaign,
      grossTotal,
      grossTotal - running
    );
    running += amount;
    breakdown.push({ campaign, amount });
  }

  return { total: running, breakdown };
}
