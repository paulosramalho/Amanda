-- CreateTable
CREATE TABLE "instagram_posts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ig_post_id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "caption" TEXT,
    "permalink" TEXT,
    "thumbnail_url" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER,
    "impressions" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "plays" INTEGER,
    "metrics_updated_at" TIMESTAMP(3),

    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_analyses" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "post_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_posts_ig_post_id_key" ON "instagram_posts"("ig_post_id");

-- CreateIndex
CREATE INDEX "instagram_posts_published_at_idx" ON "instagram_posts"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_analyses_post_id_key" ON "post_analyses"("post_id");

-- AddForeignKey
ALTER TABLE "post_analyses" ADD CONSTRAINT "post_analyses_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "instagram_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
