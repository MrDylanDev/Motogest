-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_sections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "order" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "checklist_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_questions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "checklist_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_executions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "mechanic_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "score" DECIMAL(5,2),
    "passed" BOOLEAN,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_answers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer" TEXT NOT NULL,
    "score" INTEGER,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_templates_tenant_id_is_active_idx" ON "checklist_templates"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "checklist_sections_template_id_order_idx" ON "checklist_sections"("template_id", "order");

-- CreateIndex
CREATE INDEX "checklist_questions_section_id_order_idx" ON "checklist_questions"("section_id", "order");

-- CreateIndex
CREATE INDEX "checklist_executions_work_order_id_status_idx" ON "checklist_executions"("work_order_id", "status");

-- CreateIndex
CREATE INDEX "checklist_executions_tenant_id_template_id_idx" ON "checklist_executions"("tenant_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_answers_execution_id_question_id_key" ON "checklist_answers"("execution_id", "question_id");

-- AddForeignKey
ALTER TABLE "checklist_sections" ADD CONSTRAINT "checklist_sections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_questions" ADD CONSTRAINT "checklist_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "checklist_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "mechanics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "checklist_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "checklist_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "checklist_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_templates" FORCE ROW LEVEL SECURITY;

ALTER TABLE "checklist_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_sections" FORCE ROW LEVEL SECURITY;

ALTER TABLE "checklist_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_questions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "checklist_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_executions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "checklist_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_answers" FORCE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "checklist_templates_tenant_isolation" ON "checklist_templates"
  FOR ALL USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "checklist_sections_tenant_isolation" ON "checklist_sections"
  FOR ALL USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "checklist_questions_tenant_isolation" ON "checklist_questions"
  FOR ALL USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "checklist_executions_tenant_isolation" ON "checklist_executions"
  FOR ALL USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "checklist_answers_tenant_isolation" ON "checklist_answers"
  FOR ALL USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "checklist_templates" TO taller_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "checklist_sections" TO taller_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "checklist_questions" TO taller_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "checklist_executions" TO taller_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "checklist_answers" TO taller_app;
