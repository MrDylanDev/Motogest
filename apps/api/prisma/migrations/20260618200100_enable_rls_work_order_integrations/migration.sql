-- Enable RLS on work_order_spare_parts
ALTER TABLE "work_order_spare_parts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_spare_parts" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "work_order_spare_parts"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- Enable RLS on work_order_costs
ALTER TABLE "work_order_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_costs" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "work_order_costs"
  USING (
    EXISTS (
      SELECT 1 FROM "work_orders"
      WHERE "work_orders"."id" = "work_order_costs"."work_order_id"
        AND "work_orders"."tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_spare_parts" TO taller_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_costs" TO taller_app;
