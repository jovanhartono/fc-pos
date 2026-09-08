CREATE TABLE "store_devices" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "store_devices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"label" varchar(64),
	"name" varchar(64) NOT NULL,
	"store_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "printer_name";--> statement-breakpoint
CREATE INDEX "store_devices_store_idx" ON "store_devices" ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_devices_store_name_uidx" ON "store_devices" ("store_id","name");--> statement-breakpoint
ALTER TABLE "store_devices" ADD CONSTRAINT "store_devices_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE;