-- CreateEnum
CREATE TYPE "BoostSuggestionStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "boost_suggestions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "post_id" TEXT NOT NULL,
    "suggested_amount" INTEGER NOT NULL,
    "estimated_leads" DOUBLE PRECISION,
    "estimated_cpl" DECIMAL(12,2),
    "reasoning" TEXT NOT NULL,
    "status" "BoostSuggestionStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "boost_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boost_suggestions_status_created_at_idx" ON "boost_suggestions"("status", "created_at");

-- AddForeignKey
ALTER TABLE "boost_suggestions" ADD CONSTRAINT "boost_suggestions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "instagram_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
