ALTER TABLE "shifts" ADD COLUMN "auto_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "clock_in_distance_km" numeric(8,3);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "clock_in_latitude" numeric(11,8);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "clock_in_longitude" numeric(11,8);