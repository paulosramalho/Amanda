-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('GOOGLE_ADS', 'META_ADS', 'INSTAGRAM_ADS', 'ORGANIC', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "business_date" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company_name" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "campaign_name" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "monthly_fee_potential" DECIMAL(12,2),
    "converted_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanhas_diarias" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "business_date" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL,
    "account_id" TEXT,
    "campaign_id" TEXT,
    "campaign_name" TEXT,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "qualified_leads" INTEGER NOT NULL DEFAULT 0,
    "cpl" DECIMAL(12,2),
    "cpc" DECIMAL(12,2),
    "ctr" DECIMAL(8,4),
    "conversion_rate" DECIMAL(8,4),
    "raw_payload" JSONB,

    CONSTRAINT "campanhas_diarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relatorios_semanais" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "week_end_date" TIMESTAMP(3) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "what_worked" TEXT NOT NULL,
    "what_to_pause" TEXT NOT NULL,
    "where_to_scale" TEXT NOT NULL,
    "recommendations" JSONB,

    CONSTRAINT "relatorios_semanais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs_execucao" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "job_name" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "error_message" TEXT,

    CONSTRAINT "jobs_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_business_date_idx" ON "leads"("business_date");

-- CreateIndex
CREATE INDEX "leads_source_status_idx" ON "leads"("source", "status");

-- CreateIndex
CREATE INDEX "campanhas_diarias_business_date_platform_idx" ON "campanhas_diarias"("business_date", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "campanhas_diarias_data_plataforma_campanha_uk" ON "campanhas_diarias"("business_date", "platform", "campaign_id");

-- CreateIndex
CREATE INDEX "relatorios_semanais_week_start_date_week_end_date_idx" ON "relatorios_semanais"("week_start_date", "week_end_date");

-- CreateIndex
CREATE UNIQUE INDEX "relatorios_semanais_competencia_scope_uk" ON "relatorios_semanais"("week_start_date", "week_end_date", "scope");

-- CreateIndex
CREATE INDEX "jobs_execucao_job_name_status_created_at_idx" ON "jobs_execucao"("job_name", "status", "created_at");
