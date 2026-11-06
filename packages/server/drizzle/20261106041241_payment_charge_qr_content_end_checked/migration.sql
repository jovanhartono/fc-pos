ALTER TABLE "payment_charges" ADD COLUMN "end_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "qr_content" text;