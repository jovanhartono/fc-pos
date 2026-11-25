// The shop's rules the web runs too. Orders, Queue and Reports load this, so it
// must not import zod, a table or the phone parser, or they download the forms too.

export {
  ORDER_SERVICE_TRANSITIONS,
  ORDER_TERMINAL_SERVICE_STATUSES,
  WORKSHOP_SERVICE_STATUSES,
  isCollectableItemStatus,
  isHandedOverByPickup,
  isInWorkshop,
  isWaitingQcOnly,
} from "@/schema/order-status";
export type { DerivedItemStatus } from "@/schema/order-status";
export { QUEUE_CATEGORY_MODES } from "@/schema/queue";
export { OTHER_CATEGORY_ID } from "@/schema/category-mix";
export {
  isComplainableLine,
  isReworkedRound,
  complaintOutcome,
} from "@/schema/complaint";
export type { ComplaintOutcome } from "@/schema/complaint";
export { clockInRequiresLocation } from "@/schema/clock-in";
export type { ClockInCoordinates } from "@/modules/shifts/shift.schema";
// The clock-in screen ranks Stores by distance to preselect the nearest one.
// It borrows the server's formula so the Store it offers is the one the server
// will measure against a moment later.
export { distanceKm } from "@/utils/geo";

export {
  isDiscountSettled,
  stackCampaignDiscounts,
  applyManualDiscount,
  orderNetDue,
  orderNetTotal,
  isBogoSlot,
} from "@/schema/discount";
export type {
  CampaignContribution,
  CampaignDiscountInput,
  DiscountLine,
} from "@/schema/discount";
export { GATEWAY_LABELS } from "@/modules/payments/gateways/types";

export type { CampaignEligibilityInput } from "@/schema/campaign-eligibility";
export { campaignIneligibilityReason } from "@/schema/campaign-eligibility";

export { TURNAROUND_PROMISE_HOURS } from "@/schema/turnaround";

export { hasUnpricedLine, isUnpricedLine } from "@/schema/unpriced-line";

export {
  allocateRefund,
  lineKey,
  orderLineRefundCaps,
} from "@/schema/refund-allocation";
export type { RefundLineRef } from "@/schema/refund-allocation";

export {
  PHOTO_MAX_DIMENSION,
  PHOTO_MAX_PASSTHROUGH_BYTES,
  PHOTO_WEBP_QUALITY,
} from "@/schema/photo-encoding";
export {
  PHOTO_THUMBNAIL_SUFFIX,
  PHOTO_TILE_SIZE,
} from "@/schema/photo-thumbnail";
