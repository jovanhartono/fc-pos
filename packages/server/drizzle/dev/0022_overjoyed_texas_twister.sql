ALTER TABLE "orders_services" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "intake_photo_s3_key" varchar(512);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "intake_photo_uploaded_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "intake_photo_url" varchar(255);