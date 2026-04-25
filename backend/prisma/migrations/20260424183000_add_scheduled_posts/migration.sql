-- CreateEnum
CREATE TYPE "ScheduledPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PublishFormat" AS ENUM ('PHOTO', 'CAROUSEL', 'REEL', 'STORY');

-- CreateTable
CREATE TABLE "scheduled_posts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "caption" TEXT NOT NULL,
    "media_urls" TEXT[],
    "format" "PublishFormat" NOT NULL,
    "first_comment" TEXT,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "ig_creation_id" TEXT,
    "ig_media_id" TEXT,
    "ig_permalink" TEXT,
    "status" "ScheduledPostStatus" NOT NULL DEFAULT 'DRAFT',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "suggestion_id" TEXT,

    CONSTRAINT "scheduled_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_posts_scheduled_for_status_idx" ON "scheduled_posts"("scheduled_for", "status");

-- CreateIndex
CREATE INDEX "scheduled_posts_status_idx" ON "scheduled_posts"("status");

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "content_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
