-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('POST', 'CAROUSEL', 'STORIES', 'REEL');

-- CreateEnum
CREATE TYPE "ContentSuggestionStatus" AS ENUM ('PENDING', 'DONE', 'DISMISSED');

-- CreateTable
CREATE TABLE "content_suggestions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "theme" TEXT NOT NULL,
    "format" "ContentFormat" NOT NULL,
    "reasoning" TEXT NOT NULL,
    "status" "ContentSuggestionStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "content_suggestions_pkey" PRIMARY KEY ("id")
);
