-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "address" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "make" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "year" INTEGER,
    "plate" VARCHAR(20) NOT NULL,
    "vin" VARCHAR(17),
    "color" VARCHAR(50),
    "fuel_type" VARCHAR(30),
    "mileage" INTEGER DEFAULT 0,
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mechanics" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "specializations" VARCHAR(100)[],
    "hire_date" TIMESTAMP(3),
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mechanics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "unit" VARCHAR(30) NOT NULL DEFAULT 'unit',
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "max_stock" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(10,2),
    "selling_price" DECIMAL(10,2),
    "supplier" VARCHAR(200),
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_tenant_id_name_idx" ON "clients"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clients_tenant_id_email_key" ON "clients"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_tenant_id_phone_key" ON "clients"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_make_model_idx" ON "vehicles"("tenant_id", "make", "model");

-- CreateIndex
CREATE INDEX "vehicles_client_id_idx" ON "vehicles"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenant_id_plate_key" ON "vehicles"("tenant_id", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenant_id_vin_key" ON "vehicles"("tenant_id", "vin");

-- CreateIndex
CREATE INDEX "mechanics_tenant_id_name_idx" ON "mechanics"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "mechanics_tenant_id_email_key" ON "mechanics"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "mechanics_tenant_id_phone_key" ON "mechanics"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "spare_parts_tenant_id_name_idx" ON "spare_parts"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "spare_parts_tenant_id_category_idx" ON "spare_parts"("tenant_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "spare_parts_tenant_id_code_key" ON "spare_parts"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================
-- Row-Level Security (RLS) — tenant isolation
-- ============================================

-- Clients
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clients" USING (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "clients" TO taller_app;

-- Vehicles
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "vehicles" USING (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "vehicles" TO taller_app;

-- Mechanics
ALTER TABLE "mechanics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mechanics" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "mechanics" USING (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "mechanics" TO taller_app;

-- Spare Parts
ALTER TABLE "spare_parts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spare_parts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "spare_parts" USING (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "spare_parts" TO taller_app;
