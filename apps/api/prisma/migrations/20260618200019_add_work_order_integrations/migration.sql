-- AlterTable
ALTER TABLE "mechanics" ADD COLUMN     "hourly_rate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "work_order_spare_parts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "spare_part_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'reserved',
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),

    CONSTRAINT "work_order_spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_costs" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "labor_cost" DECIMAL(10,2),
    "parts_cost" DECIMAL(10,2),
    "subtotal" DECIMAL(10,2),
    "tax_rate" DECIMAL(5,4) DEFAULT 0.21,
    "tax_amount" DECIMAL(10,2),
    "discount_percent" DECIMAL(5,2),
    "discount_amount" DECIMAL(10,2),
    "total" DECIMAL(10,2),
    "calculated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_spare_parts_work_order_id_idx" ON "work_order_spare_parts"("work_order_id");

-- CreateIndex
CREATE INDEX "work_order_spare_parts_spare_part_id_idx" ON "work_order_spare_parts"("spare_part_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_costs_work_order_id_key" ON "work_order_costs"("work_order_id");

-- AddForeignKey
ALTER TABLE "work_order_spare_parts" ADD CONSTRAINT "work_order_spare_parts_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_spare_parts" ADD CONSTRAINT "work_order_spare_parts_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_costs" ADD CONSTRAINT "work_order_costs_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
