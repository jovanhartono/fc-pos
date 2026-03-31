ALTER TABLE "products" ADD COLUMN "cogs" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "cogs" numeric(12, 2) DEFAULT '0' NOT NULL;