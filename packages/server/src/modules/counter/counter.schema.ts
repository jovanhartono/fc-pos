import { z } from "zod";

export const GETCounterQuerySchema = z.object({
  store_id: z.coerce.number().int().positive(),
});

export interface CounterEstimate {
  days_high: number;
  days_low: number;
}

export interface CounterCategory {
  after_clean: boolean;
  category_id: number;
  estimate: CounterEstimate | null;
  in_progress: number;
  items_waiting: number;
  name: string;
  queued: number;
}

export interface CounterShelfOrder {
  customer_name: string;
  customer_phone: string;
  items: number;
  order_id: number;
  ready_days: number;
}

export interface CounterPickupShelf {
  items: number;
  oldest: CounterShelfOrder[];
  orders: number;
}

export interface CounterQcReject {
  category: string;
  days: number;
  item_code: string;
  note: string | null;
  order_id: number;
  order_service_id: number;
}

export interface CounterComplaint {
  category: string;
  complaint_id: number;
  days: number;
  item_code: string;
  reason: string | null;
}

export type CounterWorkshop = Pick<CounterCategory, "in_progress" | "queued">;

export interface Counter {
  categories: CounterCategory[];
  complaints: CounterComplaint[];
  pickup_shelf: CounterPickupShelf;
  qc_rejects: CounterQcReject[];
  workshop: CounterWorkshop;
}
