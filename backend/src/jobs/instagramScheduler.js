import { runInstagramCollectionJob } from "./instagramCollectionJob.js";
import { runPostAnalysisJob } from "./postAnalysisJob.js";
import { runTrendingSuggestionsJob } from "./trendingSuggestionsJob.js";
import { sendInstagramAnalysisEmail, getTokenDaysUsed } from "../lib/instagramNotify.js";
import { prisma } from "../lib/prisma.js";

const DEFAULT_RUN_UTC_HOUR = 4;  // 01:00 BRT
const DEFAULT_TICK_MS = 60_000;

const state = { started: false, runUtcHour: DEFAULT_RUN_UTC_HOUR, tickMs: DEFAULT_TICK_MS, lastRunKey: null };
let timer = null;

function toBoolean(v, d = false) {
  if (v === undefined) return d;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function toInteger(v, d) {
  const n = Number.parseInt(String(v ?? d), 10);
  return Number.isFinite(n) ? n : d;
}

async function runFullCycle({ triggeredBy = "scheduler" } = {}) {
  console.log(`[instagram-scheduler] Starting cycle (${triggeredBy})`);

  // 1. Coleta
  try {
    const col = await runInstagramCollectionJob({ triggeredBy });
    console.log("[instagram-scheduler] Collection:", col.postsCollected ?? col.reason);
  } catch (e) {
    console.error("[instagram-scheduler] Collection failed:", e.message);
    // Se token expirou, avisa por e-mail
    if (/OAuthException|token|session/i.test(e.message)) {
      await sendInstagramAnalysisEmail({
        investPosts: [],
        removePosts: [],
        tokenDaysUsed: 999,
      }).catch(() => {});
    }
    return;
  }

  // 2. Análise de posts sem análise
  try {
    const ana = await runPostAnalysisJob({ triggeredBy });
    console.log("[instagram-scheduler] Analysis:", ana.analyzed, "posts");
  } catch (e) {
    console.error("[instagram-scheduler] Analysis failed:", e.message);
  }

  // 3. Sugestões de tendência (varrendo portais jurídicos)
  try {
    const trend = await runTrendingSuggestionsJob({ triggeredBy });
    console.log("[instagram-scheduler] Trending suggestions:", trend.created ?? 0, "from", (trend.sources || []).join(", "));
  } catch (e) {
    console.error("[instagram-scheduler] Trending suggestions failed:", e.message);
  }

  // 4. Busca posts INVEST ou REMOVE para notificar
  const actionPosts = await prisma.postAnalysis.findMany({
    where: { action: { in: ["INVEST", "REMOVE"] } },
    include: { post: true },
    orderBy: { score: "desc" },
    take: 10,
  });

  if (actionPosts.length === 0) {
    console.log("[instagram-scheduler] No INVEST/REMOVE posts to notify.");
    return;
  }

  const investPosts = actionPosts.filter((p) => p.action === "INVEST").map((p) => ({ post: p.post, analysis: p }));
  const removePosts = actionPosts.filter((p) => p.action === "REMOVE").map((p) => ({ post: p.post, analysis: p }));

  const tokenDaysUsed = getTokenDaysUsed();
  await sendInstagramAnalysisEmail({ investPosts, removePosts, tokenDaysUsed }).catch((e) => {
    console.error("[instagram-scheduler] Notify email failed:", e.message);
  });
}

async function tick() {
  const now = new Date();
  if (now.getUTCHours() !== state.runUtcHour) return;

  const key = `${now.toISOString().slice(0, 10)}_${state.runUtcHour}h`;
  if (state.lastRunKey === key) return;
  state.lastRunKey = key;

  await runFullCycle();
}

export function startInstagramScheduler() {
  const enabled = toBoolean(process.env.INSTAGRAM_SCHEDULER_ENABLED, false);
  state.runUtcHour = Math.min(23, Math.max(0, toInteger(process.env.INSTAGRAM_RUN_UTC_HOUR, DEFAULT_RUN_UTC_HOUR)));
  state.tickMs = Math.max(15_000, toInteger(process.env.ADS_COLLECTION_SCHEDULER_TICK_MS, DEFAULT_TICK_MS));

  if (!enabled) { state.started = false; return { ...state, enabled }; }

  if (timer) clearInterval(timer);
  timer = setInterval(() => { void tick(); }, state.tickMs);
  state.started = true;
  return { ...state, enabled };
}

export function stopInstagramScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
  state.started = false;
}

export { runFullCycle as runInstagramCycle };
