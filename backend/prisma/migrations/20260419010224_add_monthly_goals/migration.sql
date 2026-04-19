-- CreateTable
CREATE TABLE "monthly_goals" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "month" TEXT NOT NULL,
    "spend_goal" DECIMAL(12,2),
    "leads_goal" INTEGER,

    CONSTRAINT "monthly_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_goals_month_key" ON "monthly_goals"("month");
