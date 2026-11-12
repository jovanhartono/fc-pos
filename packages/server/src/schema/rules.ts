// The shop's rules the web runs too. Orders, Queue and Reports load this, so it
// must not import zod, a table or the phone parser, or they download the forms too.

import { GATEWAY_LABELS as _GATEWAY_LABELS } from "@/modules/payments/gateways/types";
import type { ClockInCoordinates as _ClockInCoordinates } from "@/modules/shifts/shift.schema";
import {
  type CampaignEligibilityInput as _CampaignEligibilityInput,
  campaignIneligibilityReason as _campaignIneligibilityReason,
} from "@/schema/campaign-eligibility";
import { OTHER_CATEGORY_ID as _OTHER_CATEGORY_ID } from "@/schema/category-mix";
import { clockInRequiresLocation as _clockInRequiresLocation } from "@/schema/clock-in";
import {
  type ComplaintOutcome as _ComplaintOutcome,
  complaintOutcome as _complaintOutcome,
  isComplainableLine as _isComplainableLine,
  isReworkedRound as _isReworkedRound,
} from "@/schema/complaint";
import {
  applyManualDiscount as _applyManualDiscount,
  type CampaignContribution as _CampaignContribution,
  type CampaignDiscountInput as _CampaignDiscountInput,
  type DiscountLine as _DiscountLine,
  isBogoSlot as _isBogoSlot,
  isDiscountSettled as _isDiscountSettled,
  orderNetDue as _orderNetDue,
  orderNetTotal as _orderNetTotal,
  stackCampaignDiscounts as _stackCampaignDiscounts,
} from "@/schema/discount";
import {
  type DerivedItemStatus as _DerivedItemStatus,
  isCollectableItemStatus as _isCollectableItemStatus,
  isHandedOverByPickup as _isHandedOverByPickup,
  isInWorkshop as _isInWorkshop,
  isWaitingQcOnly as _isWaitingQcOnly,
  ORDER_SERVICE_TRANSITIONS as _ORDER_SERVICE_TRANSITIONS,
  ORDER_TERMINAL_SERVICE_STATUSES as _ORDER_TERMINAL_SERVICE_STATUSES,
  WORKSHOP_SERVICE_STATUSES as _WORKSHOP_SERVICE_STATUSES,
} from "@/schema/order-status";
import {
  PHOTO_THUMBNAIL_SUFFIX as _PHOTO_THUMBNAIL_SUFFIX,
  PHOTO_TILE_SIZE as _PHOTO_TILE_SIZE,
} from "@/schema/photo-thumbnail";
import { QUEUE_CATEGORY_MODES as _QUEUE_CATEGORY_MODES } from "@/schema/queue";
import {
  allocateRefund as _allocateRefund,
  lineKey as _lineKey,
  orderLineRefundCaps as _orderLineRefundCaps,
} from "@/schema/refund-allocation";
import { TURNAROUND_PROMISE_HOURS as _TURNAROUND_PROMISE_HOURS } from "@/schema/turnaround";
import {
  hasUnpricedLine as _hasUnpricedLine,
  isUnpricedLine as _isUnpricedLine,
} from "@/schema/unpriced-line";
import { distanceKm as _distanceKm } from "@/utils/geo";

export const ORDER_SERVICE_TRANSITIONS = _ORDER_SERVICE_TRANSITIONS;
export const ORDER_TERMINAL_SERVICE_STATUSES = _ORDER_TERMINAL_SERVICE_STATUSES;
export const WORKSHOP_SERVICE_STATUSES = _WORKSHOP_SERVICE_STATUSES;
export const QUEUE_CATEGORY_MODES = _QUEUE_CATEGORY_MODES;
export const OTHER_CATEGORY_ID = _OTHER_CATEGORY_ID;
export type DerivedItemStatus = _DerivedItemStatus;
export const isCollectableItemStatus = _isCollectableItemStatus;
export const isHandedOverByPickup = _isHandedOverByPickup;
export const isInWorkshop = _isInWorkshop;
export const isWaitingQcOnly = _isWaitingQcOnly;
export const isComplainableLine = _isComplainableLine;
export const isReworkedRound = _isReworkedRound;
export const complaintOutcome = _complaintOutcome;
export type ComplaintOutcome = _ComplaintOutcome;
export const clockInRequiresLocation = _clockInRequiresLocation;
export type ClockInCoordinates = _ClockInCoordinates;
// The clock-in screen ranks Stores by distance to preselect the nearest one.
// It borrows the server's formula so the Store it offers is the one the server
// will measure against a moment later.
export const distanceKm = _distanceKm;

export const isDiscountSettled = _isDiscountSettled;
export type CampaignContribution<T extends _CampaignDiscountInput> =
  _CampaignContribution<T>;
export type CampaignDiscountInput = _CampaignDiscountInput;
export type DiscountLine = _DiscountLine;
export const stackCampaignDiscounts = _stackCampaignDiscounts;
export const applyManualDiscount = _applyManualDiscount;
export const orderNetDue = _orderNetDue;
export const orderNetTotal = _orderNetTotal;
export const isBogoSlot = _isBogoSlot;
export const GATEWAY_LABELS = _GATEWAY_LABELS;

export type CampaignEligibilityInput = _CampaignEligibilityInput;
export const campaignIneligibilityReason = _campaignIneligibilityReason;

export const TURNAROUND_PROMISE_HOURS = _TURNAROUND_PROMISE_HOURS;

export const hasUnpricedLine = _hasUnpricedLine;
export const isUnpricedLine = _isUnpricedLine;

export const allocateRefund = _allocateRefund;
export const lineKey = _lineKey;
export const orderLineRefundCaps = _orderLineRefundCaps;

export const PHOTO_THUMBNAIL_SUFFIX = _PHOTO_THUMBNAIL_SUFFIX;
export const PHOTO_TILE_SIZE = _PHOTO_TILE_SIZE;
