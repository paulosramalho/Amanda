import { prisma } from "../lib/prisma.js";

const BASE_URL = `https://graph.facebook.com/${process.env.INSTAGRAM_API_VERSION || "v22.0"}`;

function toBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function getIgUserId(accessToken) {
  // Uso direto se INSTAGRAM_USER_ID estiver configurado
  if (process.env.INSTAGRAM_USER_ID) {
    return { igUserId: process.env.INSTAGRAM_USER_ID, token: accessToken };
  }

  // Percorre páginas buscando a que tem instagram_business_account
  const pages = await apiFetch(`${BASE_URL}/me/accounts?access_token=${accessToken}`);
  if (!pages.data?.length) throw new Error("Nenhuma Página do Facebook encontrada para este token");

  for (const page of pages.data) {
    const token = page.access_token || accessToken;
    try {
      const igData = await apiFetch(`${BASE_URL}/${page.id}?fields=instagram_business_account&access_token=${token}`);
      if (igData.instagram_business_account?.id) {
        return { igUserId: igData.instagram_business_account.id, token };
      }
    } catch {
      continue;
    }
  }

  throw new Error("Nenhuma conta Instagram vinculada encontrada. Configure INSTAGRAM_USER_ID.");
}

async function fetchInsights(postId, mediaType, token) {
  const metrics = ["impressions", "reach", "saved", "shares"];
  if (["VIDEO", "REELS"].includes(mediaType)) metrics.push("plays");
  try {
    const data = await apiFetch(`${BASE_URL}/${postId}/insights?metric=${metrics.join(",")}&access_token=${token}`);
    const result = {};
    for (const item of data.data || []) result[item.name] = item.values?.[0]?.value ?? item.value ?? 0;
    return result;
  } catch {
    return {};
  }
}

export async function runInstagramCollectionJob({ triggeredBy = "manual" } = {}) {
  if (!toBoolean(process.env.INSTAGRAM_ENABLED, false)) {
    return { ok: true, status: "skipped", reason: "INSTAGRAM_ENABLED is false" };
  }

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ADS_ACCESS_TOKEN;
  if (!accessToken) return { ok: false, reason: "Missing INSTAGRAM_ACCESS_TOKEN" };

  const job = await prisma.jobExecution.create({
    data: { jobName: "instagram_collection", status: "RUNNING", attempt: 1, startedAt: new Date(), details: { trigger: triggeredBy } },
  });

  try {
    const { igUserId, token } = await getIgUserId(accessToken);

    const fields = "id,caption,media_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url";
    const media = await apiFetch(`${BASE_URL}/${igUserId}/media?fields=${fields}&limit=50&access_token=${token}`);
    const posts = media.data || [];

    let upserted = 0;
    for (const post of posts) {
      const insights = await fetchInsights(post.id, post.media_type, token);
      const data = {
        mediaType: post.media_type || "IMAGE",
        caption: post.caption || null,
        permalink: post.permalink || null,
        thumbnailUrl: post.thumbnail_url || post.media_url || null,
        publishedAt: new Date(post.timestamp),
        likeCount: post.like_count || 0,
        commentsCount: post.comments_count || 0,
        reach: insights.reach ?? null,
        impressions: insights.impressions ?? null,
        saved: insights.saved ?? null,
        shares: insights.shares ?? null,
        plays: insights.plays ?? null,
        metricsUpdatedAt: new Date(),
      };
      await prisma.instagramPost.upsert({ where: { igPostId: post.id }, create: { igPostId: post.id, ...data }, update: data });
      upserted++;
    }

    await prisma.jobExecution.update({
      where: { id: job.id },
      data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, postsCollected: upserted, igUserId } },
    });

    return { ok: true, postsCollected: upserted };
  } catch (error) {
    await prisma.jobExecution.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: error instanceof Error ? error.message : "unknown error" },
    });
    throw error;
  }
}
