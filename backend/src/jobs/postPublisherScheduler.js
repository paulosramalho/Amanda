import { prisma } from "../lib/prisma.js";
import { sendAdminAlert } from "../lib/adminNotify.js";

const BASE_URL = `https://graph.facebook.com/${process.env.INSTAGRAM_API_VERSION || "v22.0"}`;
const DEFAULT_TICK_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;

const state = { started: false, tickMs: DEFAULT_TICK_MS, busy: false };
let timer = null;

function toBoolean(v, d = false) {
  if (v === undefined) return d;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function toInteger(v, d) {
  const n = Number.parseInt(String(v ?? d), 10);
  return Number.isFinite(n) ? n : d;
}

async function apiCall(method, path, params) {
  const url = new URL(`${BASE_URL}${path}`);
  if (method === "GET" && params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  const init = { method };
  if (method !== "GET" && params) {
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    init.body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  }
  const res = await fetch(url.toString(), init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error?.message || data.error?.error_user_msg || `HTTP ${res.status}`;
    throw new Error(`Instagram API ${res.status}: ${msg}`);
  }
  return data;
}

async function getIgUserAndToken() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) throw new Error("INSTAGRAM_ACCESS_TOKEN não configurado");

  const pages = await apiCall("GET", "/me/accounts", { access_token: accessToken });
  if (!pages.data?.length) throw new Error("Token não enxerga nenhuma Page do Facebook");

  const targetIgId = process.env.INSTAGRAM_USER_ID;
  const tried = [];
  for (const page of pages.data) {
    const pageToken = page.access_token || accessToken;
    try {
      const link = await apiCall("GET", `/${page.id}`, { fields: "instagram_business_account", access_token: pageToken });
      const igId = link.instagram_business_account?.id;
      if (!igId) continue;
      tried.push(`${page.name}:${igId}`);
      if (targetIgId && igId !== targetIgId) continue;
      return { igUserId: igId, token: pageToken, pageName: page.name };
    } catch { continue; }
  }
  throw new Error(`Page com IG ${targetIgId || "(qualquer)"} não encontrada. Tentadas: ${tried.join(", ") || "(nenhuma com IG linkado)"}`);
}

async function publishPhoto({ igUserId, token, mediaUrl, caption }) {
  const container = await apiCall("POST", `/${igUserId}/media`, { image_url: mediaUrl, caption, access_token: token });
  const publish = await apiCall("POST", `/${igUserId}/media_publish`, { creation_id: container.id, access_token: token });
  return { creationId: container.id, mediaId: publish.id };
}

async function publishCarousel({ igUserId, token, mediaUrls, caption }) {
  const childIds = [];
  for (const url of mediaUrls) {
    const child = await apiCall("POST", `/${igUserId}/media`, { image_url: url, is_carousel_item: true, access_token: token });
    childIds.push(child.id);
  }
  const container = await apiCall("POST", `/${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: token,
  });
  const publish = await apiCall("POST", `/${igUserId}/media_publish`, { creation_id: container.id, access_token: token });
  return { creationId: container.id, mediaId: publish.id };
}

// Story: foto é síncrona, vídeo é assíncrono (mesmo padrão do Reel)
// Detecta por extensão. Aspect ratio ideal: 9:16. Vídeo: ≤60s, ≤100MB. Foto: ≤8MB.
async function publishStory({ igUserId, token, mediaUrl, caption }) {
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl);
  const params = { media_type: "STORIES", caption, access_token: token };
  if (isVideo) params.video_url = mediaUrl;
  else params.image_url = mediaUrl;

  const container = await apiCall("POST", `/${igUserId}/media`, params);
  console.log(`[postPublisher] Story container criado: ${container.id} (${isVideo ? "vídeo" : "foto"})`);

  if (isVideo) {
    const start = Date.now();
    const TIMEOUT_MS = 4 * 60 * 1000;
    const POLL_INTERVAL_MS = 15_000;
    let status = "IN_PROGRESS";
    let lastInfo = {};
    while (status === "IN_PROGRESS") {
      if (Date.now() - start > TIMEOUT_MS) {
        throw new Error(`Timeout (4min) processando Story vídeo. creation_id=${container.id}`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      lastInfo = await apiCall("GET", `/${container.id}`, { fields: "status_code", access_token: token });
      status = lastInfo.status_code || "IN_PROGRESS";
      console.log(`[postPublisher] Story ${container.id} status=${status} (após ${Math.round((Date.now() - start) / 1000)}s)`);
    }
    if (status === "ERROR") throw new Error(`Story processamento ERROR: ${lastInfo.status_code_description || "sem detalhes"}`);
    if (status === "EXPIRED") throw new Error("Story container expirou.");
    if (status !== "FINISHED") throw new Error(`Story status inesperado: ${status}`);
  }

  const publish = await apiCall("POST", `/${igUserId}/media_publish`, { creation_id: container.id, access_token: token });
  return { creationId: container.id, mediaId: publish.id };
}

// Reel: publicação assíncrona — Instagram processa o vídeo, faz poll do status_code
async function publishReel({ igUserId, token, videoUrl, caption }) {
  const container = await apiCall("POST", `/${igUserId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    access_token: token,
  });
  console.log(`[postPublisher] Reel container criado: ${container.id} — aguardando processamento`);

  const start = Date.now();
  const TIMEOUT_MS = 4 * 60 * 1000; // 4min — depois desistimos para não travar o tick
  const POLL_INTERVAL_MS = 15_000;

  let status = "IN_PROGRESS";
  let lastInfo = {};
  while (status === "IN_PROGRESS") {
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error(`Timeout (4min) processando vídeo. creation_id=${container.id} — Instagram pode finalizar depois, tente publish-now mais tarde.`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    lastInfo = await apiCall("GET", `/${container.id}`, { fields: "status_code", access_token: token });
    status = lastInfo.status_code || "IN_PROGRESS";
    console.log(`[postPublisher] Reel ${container.id} status=${status} (após ${Math.round((Date.now() - start) / 1000)}s)`);
  }

  if (status === "ERROR") throw new Error(`Reel processamento ERROR: ${lastInfo.status_code_description || "sem detalhes"}`);
  if (status === "EXPIRED") throw new Error("Reel container expirou antes de publicar (limite ~24h da API).");
  if (status !== "FINISHED") throw new Error(`Reel status inesperado: ${status}`);

  const publish = await apiCall("POST", `/${igUserId}/media_publish`, { creation_id: container.id, access_token: token });
  return { creationId: container.id, mediaId: publish.id };
}

async function getPermalink(mediaId, token) {
  try {
    const data = await apiCall("GET", `/${mediaId}`, { fields: "permalink", access_token: token });
    return data.permalink || null;
  } catch { return null; }
}

async function postFirstComment(mediaId, comment, token) {
  await apiCall("POST", `/${mediaId}/comments`, { message: comment, access_token: token });
}

async function publishOne(post) {
  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: "PUBLISHING", errorMessage: null },
  });

  try {
    if (!post.mediaUrls?.length) throw new Error("Nenhuma URL de mídia configurada.");
    if (post.format === "CAROUSEL" && (post.mediaUrls.length < 2 || post.mediaUrls.length > 10)) {
      throw new Error(`Carrossel exige 2-10 imagens (recebeu ${post.mediaUrls.length}).`);
    }
    if (["PHOTO", "REEL", "STORY"].includes(post.format) && post.mediaUrls.length !== 1) {
      throw new Error(`${post.format} exige exatamente 1 URL (recebeu ${post.mediaUrls.length}).`);
    }

    const { igUserId, token } = await getIgUserAndToken();

    let result;
    if (post.format === "PHOTO") {
      result = await publishPhoto({ igUserId, token, mediaUrl: post.mediaUrls[0], caption: post.caption });
    } else if (post.format === "CAROUSEL") {
      result = await publishCarousel({ igUserId, token, mediaUrls: post.mediaUrls, caption: post.caption });
    } else if (post.format === "REEL") {
      result = await publishReel({ igUserId, token, videoUrl: post.mediaUrls[0], caption: post.caption });
    } else if (post.format === "STORY") {
      result = await publishStory({ igUserId, token, mediaUrl: post.mediaUrls[0], caption: post.caption });
    } else {
      throw new Error(`Formato ${post.format} não suportado.`);
    }

    const permalink = await getPermalink(result.mediaId, token);

    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        igCreationId: result.creationId,
        igMediaId: result.mediaId,
        igPermalink: permalink,
      },
    });

    if (post.firstComment) {
      try { await postFirstComment(result.mediaId, post.firstComment, token); }
      catch (e) { console.warn(`[postPublisher] firstComment falhou para ${post.id}: ${e.message}`); }
    }

    if (post.suggestionId) {
      await prisma.contentSuggestion.update({
        where: { id: post.suggestionId },
        data: { status: "DONE" },
      }).catch((e) => console.warn(`[postPublisher] sugestão ${post.suggestionId} não marcada DONE: ${e.message}`));
    }

    console.log(`[postPublisher] PUBLISHED ${post.id} → ${permalink}`);
    return { ok: true, postId: post.id, mediaId: result.mediaId, permalink };
  } catch (e) {
    const newRetry = (post.retryCount || 0) + 1;
    const final = newRetry >= MAX_RETRIES;
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: final ? "FAILED" : "SCHEDULED",
        errorMessage: e.message?.slice(0, 500) || "unknown error",
        retryCount: newRetry,
      },
    });

    console.error(`[postPublisher] FAIL ${post.id} (tentativa ${newRetry}/${MAX_RETRIES}): ${e.message}`);

    if (final) {
      sendAdminAlert({
        subject: "🔴 AMR Ads — Falha na publicação Instagram",
        title: "Post agendado falhou após 3 tentativas",
        body: `Post #${post.id}\nLegenda: ${(post.caption || "(vazia)").slice(0, 200)}\nÚltimo erro: ${(e.message || "").slice(0, 300)}`,
        steps: [
          "Verificar URL da mídia (deve ser HTTPS pública, JPEG/PNG, ≤8MB, sem canal alpha)",
          "Verificar escopos do token: <code>instagram_content_publish</code> + <code>instagram_basic</code>",
          "Verificar limite de publicações (50/24h por usuário)",
          "No painel: cancelar OU re-agendar com nova mídia",
        ],
      }).catch(() => {});
    }
    return { ok: false, postId: post.id, error: e.message };
  }
}

export async function runPostPublisherTick({ now = new Date(), triggeredBy = "scheduler" } = {}) {
  if (state.busy) return { skipped: true, reason: "already running" };
  state.busy = true;

  const job = await prisma.jobExecution.create({
    data: { jobName: "post_publisher", status: "RUNNING", attempt: 1, startedAt: new Date(), details: { trigger: triggeredBy } },
  });

  try {
    if (!toBoolean(process.env.IG_PUBLISH_ENABLED, false)) {
      const result = { skipped: true, reason: "IG_PUBLISH_ENABLED is false" };
      await prisma.jobExecution.update({
        where: { id: job.id },
        data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, ...result } },
      });
      return result;
    }

    const due = await prisma.scheduledPost.findMany({
      where: { status: "SCHEDULED", scheduledFor: { lte: now } },
      orderBy: { scheduledFor: "asc" },
      take: 10,
    });

    if (!due.length) {
      const result = { processed: 0, dueCount: 0 };
      await prisma.jobExecution.update({
        where: { id: job.id },
        data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, ...result } },
      });
      return result;
    }

    const results = [];
    for (const post of due) results.push(await publishOne(post));
    const success = results.filter((r) => r.ok).length;
    const failed = results.length - success;
    const result = { processed: results.length, success, failed };

    await prisma.jobExecution.update({
      where: { id: job.id },
      data: {
        status: failed > 0 ? "FAILED" : "SUCCESS",
        finishedAt: new Date(),
        details: { trigger: triggeredBy, ...result, results },
        errorMessage: failed > 0 ? `${failed} de ${results.length} falharam` : null,
      },
    });

    return result;
  } catch (e) {
    await prisma.jobExecution.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: e.message?.slice(0, 500) || "unknown error" },
    });
    throw e;
  } finally {
    state.busy = false;
  }
}

export async function publishNow(postId) {
  const post = await prisma.scheduledPost.findUniqueOrThrow({ where: { id: postId } });
  if (post.status === "PUBLISHED") throw new Error("Post já foi publicado.");
  if (post.status === "CANCELLED") throw new Error("Post está cancelado — re-agende antes.");
  if (post.status === "PUBLISHING") throw new Error("Publicação em andamento.");

  await prisma.scheduledPost.update({
    where: { id: postId },
    data: { retryCount: 0, errorMessage: null },
  });
  return publishOne({ ...post, retryCount: 0 });
}

export function startPostPublisherScheduler() {
  state.tickMs = Math.max(60_000, toInteger(process.env.POST_PUBLISHER_TICK_MS, DEFAULT_TICK_MS));
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void runPostPublisherTick(); }, state.tickMs);
  state.started = true;
  console.log(`[postPublisher] scheduler iniciado (tick=${state.tickMs}ms, IG_PUBLISH_ENABLED=${process.env.IG_PUBLISH_ENABLED || "false"})`);
  return { ...state };
}

export function stopPostPublisherScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
  state.started = false;
}
