import { z } from "zod";
import type { refundReasonEnum } from "@/db/schema";
import { dateStringSchema } from "@/schema/common";

export const GETDayCloseQuerySchema = z.object({
  // A hand-edited link like 2026-02-31 would otherwise roll into March.
  date: dateStringSchema("date").refine(
    (date) => new Date(`${date}T00:00:00Z`).toISOString().startsWith(date),
    "date is not a real day"
  ),
  store_id: z.coerce.number().int().positive(),
});

export interface DayCloseTotal {
  amount: number;
  payments: number;
}

export interface DayCloseCollected extends DayCloseTotal {
  earlier: DayCloseTotal;
  this_day: DayCloseTotal;
}

export interface DayCloseMethod {
  amount: number;
  name: string;
  payment_method_id: number | null;
  payments: number;
}

export interface DayClosePayment {
  amount: number;
  created_day: string;
  order_code: string;
  order_id: number;
  paid_at: string;
  payment_method_id: number | null;
  payment_method_name: string;
  recorded_by: string | null;
}

export interface DayCloseRefund {
  amount: number;
  order_code: string;
  order_id: number;
  paid_day: string | null;
  payment_method_name: string;
  reasons: (typeof refundReasonEnum.enumValues)[number][];
  refunded_at: string;
}

export interface DayCloseServiceCount {
  count: number;
  name: string;
}

export interface DayCloseCategory {
  count: number;
  name: string;
  services: DayCloseServiceCount[];
}

export interface DayCloseProductLine {
  name: string;
  qty: number;
}

export interface DayCloseOrder {
  amount: number;
  created_at: string;
  is_cancelled: boolean;
  is_paid: boolean;
  items: number;
  order_code: string;
  order_id: number;
  paid_day: string | null;
  payment_method_name: string | null;
}

export interface DayCloseDroppedOff {
  categories: DayCloseCategory[];
  items: number;
  order_list: DayCloseOrder[];
  orders: number;
  product_lines: DayCloseProductLine[];
  products: number;
  services: number;
}

export interface DayCloseUnpaid {
  amount: number;
  orders: number;
}

export interface DayClosePickedUp {
  items: number;
  orders: number;
}

export interface DayClose {
  collected: DayCloseCollected;
  date: string;
  dropped_off: DayCloseDroppedOff;
  methods: DayCloseMethod[];
  payments: DayClosePayment[];
  picked_up: DayClosePickedUp;
  refunds: DayCloseRefund[];
  unpaid: DayCloseUnpaid;
}
