export interface CampaignDiscountInput {
  discount_type: "fixed" | "percentage" | "buy_n_get_m_free";
  discount_value: string;
  max_discount: string | null;
  min_order_total?: string | null;
  buy_quantity?: number | null;
  free_quantity?: number | null;
  eligible_service_ids?: number[];
}

export interface DiscountLine {
  price: number;
  service_id: number;
}

export interface CampaignContribution<T extends CampaignDiscountInput> {
  campaign: T;
  amount: number;
}

export interface StackedDiscount<T extends CampaignDiscountInput> {
  total: number;
  breakdown: CampaignContribution<T>[];
}

function computeBogoContribution(
  campaign: CampaignDiscountInput,
  lines: DiscountLine[]
): number {
  const buy = campaign.buy_quantity ?? 0;
  const free = campaign.free_quantity ?? 0;
  if (buy < 1 || free < 1) {
    return 0;
  }

  const eligibleIds = new Set(campaign.eligible_service_ids ?? []);
  if (eligibleIds.size === 0) {
    return 0;
  }

  const eligiblePrices = lines
    .filter((line) => eligibleIds.has(line.service_id))
    .map((line) => line.price)
    .sort((a, b) => a - b);

  const groupSize = buy + free;
  const freeCount = Math.floor(eligiblePrices.length / groupSize) * free;
  if (freeCount === 0) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < freeCount; i++) {
    total += eligiblePrices[i] ?? 0;
  }
  return total;
}

export function computeCampaignContribution(
  campaign: CampaignDiscountInput,
  grossTotal: number,
  remaining: number,
  lines: DiscountLine[] = []
): number {
  if (remaining <= 0) {
    return 0;
  }

  const minOrderTotal = Number(campaign.min_order_total ?? 0);
  if (grossTotal < minOrderTotal) {
    return 0;
  }

  let contribution: number;
  if (campaign.discount_type === "buy_n_get_m_free") {
    contribution = computeBogoContribution(campaign, lines);
  } else if (campaign.discount_type === "percentage") {
    contribution = (remaining * Number(campaign.discount_value)) / 100;
  } else {
    contribution = Number(campaign.discount_value);
  }

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
  campaigns: T[],
  lines: DiscountLine[] = []
): StackedDiscount<T> {
  const ordered = campaigns
    .map((campaign) => ({
      campaign,
      priority: computeCampaignContribution(
        campaign,
        grossTotal,
        grossTotal,
        lines
      ),
    }))
    .sort((a, b) => b.priority - a.priority);

  let running = 0;
  const breakdown: CampaignContribution<T>[] = [];

  for (const { campaign } of ordered) {
    const amount = computeCampaignContribution(
      campaign,
      grossTotal,
      grossTotal - running,
      lines
    );
    running += amount;
    breakdown.push({ campaign, amount });
  }

  return { total: running, breakdown };
}
