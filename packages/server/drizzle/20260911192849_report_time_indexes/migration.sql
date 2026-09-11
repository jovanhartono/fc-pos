CREATE INDEX "order_pickup_events_picked_up_at_idx" ON "order_pickup_events" ("picked_up_at");--> statement-breakpoint
CREATE INDEX "order_refunds_created_at_idx" ON "order_refunds" ("created_at");--> statement-breakpoint
CREATE INDEX "order_service_status_logs_qc_idx" ON "order_service_status_logs" ("to_status","created_at") WHERE "to_status" IN ('quality_check', 'qc_reject');--> statement-breakpoint
CREATE INDEX "order_paid_at_idx" ON "orders" ("paid_at");