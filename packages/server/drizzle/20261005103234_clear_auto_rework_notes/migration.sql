-- Rework lines used to carry a machine-written note. Clear only that exact
-- text, so a note a cashier wrote on a Rework line survives.
UPDATE "orders_services"
SET "notes" = NULL
WHERE "complaint_id" IS NOT NULL
  AND "notes" ~ '^Rework for complaint #[0-9]+$';
