-- An order number is sequential per laboratory, so its uniqueness has to be too.
--
-- The sequence has always been computed per lab, on purpose: a shared one would
-- let each vendor read the others' order volume out of the gaps in its own
-- numbering. The unique index was global, though, so the first laboratory to
-- number an order 09AA00001 took that value away from every other laboratory.
-- With one vendor this never showed. With two, order creation failed with a
-- unique-constraint error the moment the second one received an order.
--
-- No data changes: existing numbers are already unique globally, so they remain
-- unique under the narrower constraint.
DROP INDEX IF EXISTS "ShedTestOrder_orderNumber_key";

CREATE UNIQUE INDEX "ShedTestOrder_lab_organization_id_orderNumber_key"
  ON "ShedTestOrder" ("lab_organization_id", "orderNumber");
