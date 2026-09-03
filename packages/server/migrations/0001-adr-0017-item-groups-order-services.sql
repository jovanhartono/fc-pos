-- ADR-0017: Item groups OrderServices
--
-- Moves the physical object out of the treatment row. `brand`, `color`,
-- `model`, `size` and the `item_code` tag stop living on `orders_services` and
-- become an `items` row; each treatment points at the object it treats.
--
-- Hand-authored, NOT `drizzle-kit push`-able. The DDL either side of the
-- backfill came from `drizzle-kit generate`, but no generator writes the
-- INSERT..SELECT in the middle: push/generate alone would ADD the NOT NULL
-- column against 357 populated rows and DROP the five columns before anything
-- had copied them, losing every tag code in the shop.
--
-- Runs as one transaction — Postgres DDL is transactional, so a failure at any
-- statement leaves the database exactly as it was. Apply with:
--
--   cd packages/server && bun -e 'import{neon}from"@neondatabase/serverless";
--   await neon(process.env.DATABASE_URL_DEV)(await Bun.file(
--   "migrations/0001-adr-0017-item-groups-order-services.sql").text())'
--
-- Backfill is one Item per existing OrderService, per the ADR: two identical
-- white Air Force 1s on one Order are two objects, so attribute-identical
-- siblings are NOT merged. Lossless, and it groups nothing retroactively.

BEGIN;

-- Pre-flight. Both columns are nullable today, and both become NOT NULL on the
-- Item. Fail with a readable reason rather than a constraint violation.
DO $$
DECLARE
  untagged integer;
  unowned integer;
BEGIN
  SELECT count(*) INTO untagged FROM orders_services WHERE item_code IS NULL;
  IF untagged > 0 THEN
    RAISE EXCEPTION
      'ADR-0017 backfill: % orders_services row(s) have no item_code. Every treatment must carry a tag before it can become an Item.', untagged;
  END IF;

  SELECT count(*) INTO unowned FROM orders_services WHERE order_id IS NULL;
  IF unowned > 0 THEN
    RAISE EXCEPTION
      'ADR-0017 backfill: % orders_services row(s) have no order_id. An Item cannot be filed against a missing Order.', unowned;
  END IF;
END $$;

-- ── Phase 1: additive ──────────────────────────────────────────────────────

CREATE TABLE "items" (
	"brand" varchar(255),
	"color" varchar(255),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_code" varchar(64) NOT NULL,
	"model" varchar(255),
	"order_id" integer NOT NULL,
	"size" varchar(64)
);

ALTER TABLE "orders_services" ADD COLUMN "item_id" integer;

CREATE INDEX "items_order_idx" ON "items" ("order_id");
CREATE UNIQUE INDEX "items_item_code_uidx" ON "items" ("item_code");
CREATE UNIQUE INDEX "items_order_id_id_uidx" ON "items" ("order_id","id");
CREATE INDEX "order_services_item_idx" ON "orders_services" ("item_id");

ALTER TABLE "items" ADD CONSTRAINT "items_order_id_orders_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_item_id_items_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;

-- ── Phase 2: backfill ──────────────────────────────────────────────────────
-- One Item per treatment row, linked back in the same pass. The join is exact
-- because item_code is UNIQUE on both sides and every source row has one
-- (asserted above).

WITH synthesised AS (
  INSERT INTO items (order_id, item_code, brand, color, model, size)
  SELECT order_id, item_code, brand, color, model, size
  FROM orders_services
  RETURNING id, item_code
)
UPDATE orders_services os
SET item_id = synthesised.id
FROM synthesised
WHERE synthesised.item_code = os.item_code;

-- Every treatment must now name an object, or the drops below would lose data.
DO $$
DECLARE
  orphaned integer;
BEGIN
  SELECT count(*) INTO orphaned FROM orders_services WHERE item_id IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION
      'ADR-0017 backfill: % orders_services row(s) still have no item_id after backfill. Refusing to drop the source columns.', orphaned;
  END IF;
END $$;

-- ── Phase 3: tighten and drop ──────────────────────────────────────────────

DROP INDEX "order_services_item_code_idx";
DROP INDEX "order_services_item_code_uidx";

ALTER TABLE "orders_services" DROP COLUMN "item_code";
ALTER TABLE "orders_services" DROP COLUMN "brand";
ALTER TABLE "orders_services" DROP COLUMN "color";
ALTER TABLE "orders_services" DROP COLUMN "model";
ALTER TABLE "orders_services" DROP COLUMN "size";

ALTER TABLE "orders_services" ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "orders_services" ALTER COLUMN "order_id" SET NOT NULL;

-- A treatment and the object it treats must agree on which Order they belong
-- to. orders_services keeps its own order_id so the status rollup reads lines
-- directly (ADR-0017); this is what stops that copy from drifting.
ALTER TABLE "orders_services" ADD CONSTRAINT "order_services_order_item_fk"
  FOREIGN KEY ("order_id","item_id") REFERENCES "items"("order_id","id") ON DELETE CASCADE;

COMMIT;
