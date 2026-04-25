import "dotenv/config";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./lib/prisma.js";
import { toBusinessDateAtNoon, toBusinessDateIsoString } from "./lib/businessDate.js";
import {
  getAdsCollectionJobName,
  listCampaignDailyRows,
  listRecentAdsCollectionJobs,
  runAdsCollectionJob,
} from "./jobs/adsCollectionJob.js";
import { generateWeeklyReport, getLatestWeeklyReport } from "./jobs/weeklyReportJob.js";
import { sendWeeklyReportEmail } from "./lib/notify.js";
import { getAdsSchedulerState, startAdsScheduler, stopAdsScheduler } from "./jobs/adsScheduler.js";
import { startWeeklyReportScheduler, stopWeeklyReportScheduler } from "./jobs/weeklyReportScheduler.js";
import {
  getGoogleAdsAuthRuntimeDebug,
  probeGoogleAdsAuthentication,
} from "./jobs/ads/providers/googleAds.js";
import { runInstagramCollectionJob } from "./jobs/instagramCollectionJob.js";
import { runPostAnalysisJob } from "./jobs/postAnalysisJob.js";
import { runPopulateSuggestionsJob } from "./jobs/populateSuggestionsJob.js";
import { runContentSuggestionsJob } from "./jobs/contentSuggestionsJob.js";
import { runTrendingSuggestionsJob } from "./jobs/trendingSuggestionsJob.js";
import { startInstagramScheduler, stopInstagramScheduler, runInstagramCycle } from "./jobs/instagramScheduler.js";
import {
  startPostPublisherScheduler,
  stopPostPublisherScheduler,
  runPostPublisherTick,
  publishNow,
} from "./jobs/postPublisherScheduler.js";
import { sendAdminAlert } from "./lib/adminNotify.js";
import { sendInstagramAnalysisEmail, getTokenDaysUsed } from "./lib/instagramNotify.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/dashboard", requireAuth);
app.use("/leads", requireAuth);

function requireSiteSecret(req, res, next) {
  const secret = process.env.SITE_SECRET;
  if (!secret) { next(); return; }
  if (req.header("x-site-secret") !== secret) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return;
  }
  next();
}

function requireAuth(req, res, next) {
  const token = req.header("authorization")?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ ok: false, message: "Token ausente" }); return; }
  try {
    jwt.verify(token, process.env.JWT_SECRET || "amr-ads-secret");
    next();
  } catch {
    res.status(401).json({ ok: false, message: "Token inválido ou expirado" });
  }
}

function isJobRunnerAuthorized(req) {
  const configuredApiKey = process.env.JOB_RUNNER_API_KEY;

  if (!configuredApiKey) {
    return true;
  }

  const receivedApiKey = req.header("x-api-key") || req.header("authorization")?.replace("Bearer ", "");
  return receivedApiKey === configuredApiKey;
}

app.post("/auth/login", (req, res) => {
  const { password } = req.body || {};
  const configured = process.env.DASHBOARD_PASSWORD;
  if (!configured) { res.status(500).json({ ok: false, message: "DASHBOARD_PASSWORD não configurado" }); return; }
  if (password !== configured) { res.status(401).json({ ok: false, message: "Senha incorreta" }); return; }
  const token = jwt.sign({ sub: "dashboard" }, process.env.JWT_SECRET || "amr-ads-secret", { expiresIn: "30d" });
  res.json({ ok: true, token });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "amanda-ads-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      ok: true,
      service: "amanda-ads-backend",
      db: "reachable",
      businessDateRule: "UTC-3 T12:00:00",
      businessDate: toBusinessDateIsoString(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: "amanda-ads-backend",
      db: "unreachable",
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
});

app.get("/business-date", (_req, res) => {
  const businessDateAtNoon = toBusinessDateAtNoon();

  res.status(200).json({
    ok: true,
    iso: toBusinessDateIsoString(businessDateAtNoon),
    utc: businessDateAtNoon.toISOString(),
    rule: "Always UTC-3 T12:00:00",
  });
});

app.get("/jobs/ads-collection/config", (_req, res) => {
  const scheduler = getAdsSchedulerState();
  const googleAuthDebug = getGoogleAdsAuthRuntimeDebug();

  res.status(200).json({
    ok: true,
    jobName: getAdsCollectionJobName(),
    scheduler,
    providers: {
      googleAdsEnabled: String(process.env.GOOGLE_ADS_ENABLED || "false"),
      metaAdsEnabled: String(process.env.META_ADS_ENABLED || "false"),
    },
    googleAuthDebug,
  });
});

async function handleGoogleAuthCheck(req, res) {
  if (!isJobRunnerAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Unauthorized diagnostics execution",
    });
    return;
  }

  try {
    const diagnostics = await probeGoogleAdsAuthentication();
    res.status(200).json({
      ok: true,
      diagnostics,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
}

app.get("/jobs/ads-collection/google-auth-check", handleGoogleAuthCheck);
app.post("/jobs/ads-collection/google-auth-check", handleGoogleAuthCheck);

app.post("/jobs/ads-collection/run", async (req, res) => {
  const jwtHeader = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  const isJwt = jwtHeader ? (() => { try { jwt.verify(jwtHeader, process.env.JWT_SECRET || "amr-ads-secret"); return true; } catch { return false; } })() : false;
  if (!isJwt && !isJobRunnerAuthorized(req)) {
    res.status(401).json({ ok: false, message: "Unauthorized job execution" });
    return;
  }

  try {
    const date = req.body?.date;
    const result = await runAdsCollectionJob({
      triggeredBy: "http",
      date,
    });

    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("YYYY-MM-DD") || message.includes("Invalid calendar date") ? 400 : 500;

    res.status(statusCode).json({
      ok: false,
      message,
    });
  }
});

app.get("/jobs/ads-collection/recent", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const jobs = await listRecentAdsCollectionJobs(limit);

    res.status(200).json({
      ok: true,
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
});

app.get("/campaigns/daily", async (req, res) => {
  try {
    const rows = await listCampaignDailyRows({
      date: req.query.date ? String(req.query.date) : undefined,
      platform: req.query.platform ? String(req.query.platform) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 200,
    });

    res.status(200).json({
      ok: true,
      count: rows.length,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("YYYY-MM-DD") || message.includes("Invalid calendar date") ? 400 : 500;

    res.status(statusCode).json({
      ok: false,
      message,
    });
  }
});

function buildFromDate(days) {
  const today = toBusinessDateAtNoon();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return from;
}

function safeNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

app.get("/dashboard/summary", async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || "30", 10) || 30, 1), 90);
    const platform = req.query.platform ? String(req.query.platform).toUpperCase() : undefined;
    const from = buildFromDate(days);

    const where = { businessDate: { gte: from } };
    if (platform) where.platform = platform;

    const rows = await prisma.campaignDaily.findMany({ where });

    const totals = { spend: 0, impressions: 0, clicks: 0, leads: 0 };
    const byPlatform = {};

    for (const row of rows) {
      const spend = safeNum(row.spend);
      totals.spend += spend;
      totals.impressions += row.impressions;
      totals.clicks += row.clicks;
      totals.leads += row.leads;

      if (!byPlatform[row.platform]) {
        byPlatform[row.platform] = { spend: 0, impressions: 0, clicks: 0, leads: 0 };
      }
      byPlatform[row.platform].spend += spend;
      byPlatform[row.platform].impressions += row.impressions;
      byPlatform[row.platform].clicks += row.clicks;
      byPlatform[row.platform].leads += row.leads;
    }

    totals.spend = parseFloat(totals.spend.toFixed(2));
    totals.cpl = totals.leads > 0 ? parseFloat((totals.spend / totals.leads).toFixed(2)) : null;
    totals.ctr = totals.impressions > 0 ? parseFloat((totals.clicks / totals.impressions).toFixed(4)) : null;
    totals.conversionRate = totals.clicks > 0 ? parseFloat((totals.leads / totals.clicks).toFixed(4)) : null;

    for (const plat of Object.keys(byPlatform)) {
      const p = byPlatform[plat];
      p.spend = parseFloat(p.spend.toFixed(2));
      p.cpl = p.leads > 0 ? parseFloat((p.spend / p.leads).toFixed(2)) : null;
      p.ctr = p.impressions > 0 ? parseFloat((p.clicks / p.impressions).toFixed(4)) : null;
    }

    const lastJob = await prisma.jobExecution.findFirst({
      where: { jobName: "ads_collection_daily", status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { finishedAt: true, details: true },
    });

    const alerts = [];
    if (lastJob?.finishedAt) {
      const hoursAgo = (Date.now() - new Date(lastJob.finishedAt).getTime()) / 3600000;
      if (hoursAgo > 25) alerts.push({ type: "stale_data", message: `Última coleta há ${Math.round(hoursAgo)}h — dados podem estar desatualizados` });
    } else {
      alerts.push({ type: "no_collection", message: "Nenhuma coleta registrada ainda" });
    }

    if (totals.leads === 0 && totals.spend > 0) {
      alerts.push({ type: "no_leads", message: `Nenhum lead no período com ${totals.spend.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} investidos` });
    }

    res.json({
      ok: true,
      period: { days, from: from.toISOString().slice(0, 10) },
      totals,
      byPlatform,
      alerts,
      lastCollection: lastJob?.finishedAt || null,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/dashboard/daily", async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || "30", 10) || 30, 1), 90);
    const platform = req.query.platform ? String(req.query.platform).toUpperCase() : undefined;
    const from = buildFromDate(days);

    const where = { businessDate: { gte: from } };
    if (platform) where.platform = platform;

    const rows = await prisma.campaignDaily.findMany({
      where,
      orderBy: { businessDate: "asc" },
      select: { businessDate: true, platform: true, spend: true, impressions: true, clicks: true, leads: true },
    });

    const byDate = {};
    for (const row of rows) {
      const date = row.businessDate.toISOString().slice(0, 10);
      if (!byDate[date]) byDate[date] = { date, spend: 0, impressions: 0, clicks: 0, leads: 0 };
      byDate[date].spend += safeNum(row.spend);
      byDate[date].impressions += row.impressions;
      byDate[date].clicks += row.clicks;
      byDate[date].leads += row.leads;
    }

    const series = Object.values(byDate).map((d) => ({
      ...d,
      spend: parseFloat(d.spend.toFixed(2)),
    }));

    res.json({ ok: true, series });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/dashboard/campaigns", async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || "30", 10) || 30, 1), 90);
    const platform = req.query.platform ? String(req.query.platform).toUpperCase() : undefined;
    const from = buildFromDate(days);

    const where = { businessDate: { gte: from } };
    if (platform) where.platform = platform;

    const rows = await prisma.campaignDaily.findMany({ where });

    const byCampaign = {};
    for (const row of rows) {
      const key = `${row.platform}|${row.campaignId}`;
      if (!byCampaign[key]) {
        byCampaign[key] = {
          platform: row.platform,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          spend: 0, impressions: 0, clicks: 0, leads: 0,
        };
      }
      byCampaign[key].spend += safeNum(row.spend);
      byCampaign[key].impressions += row.impressions;
      byCampaign[key].clicks += row.clicks;
      byCampaign[key].leads += row.leads;
    }

    const campaigns = Object.values(byCampaign)
      .map((c) => ({
        ...c,
        spend: parseFloat(c.spend.toFixed(2)),
        cpl: c.leads > 0 ? parseFloat((c.spend / c.leads).toFixed(2)) : null,
        ctr: c.impressions > 0 ? parseFloat((c.clicks / c.impressions * 100).toFixed(2)) : null,
        conversionRate: c.clicks > 0 ? parseFloat((c.leads / c.clicks * 100).toFixed(2)) : null,
      }))
      .sort((a, b) => b.spend - a.spend);

    res.json({ ok: true, campaigns });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/dashboard/weekly-reports", async (_req, res) => {
  try {
    const reports = await prisma.weeklyReport.findMany({
      orderBy: { weekStartDate: "desc" },
      take: 12,
    });
    res.json({ ok: true, reports });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/dashboard/monthly-goal", async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const goal = await prisma.monthlyGoal.findUnique({ where: { month } });
    res.json({ ok: true, goal: goal || null, month });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.put("/dashboard/monthly-goal", async (req, res) => {
  try {
    const { month, spendGoal, leadsGoal } = req.body || {};
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ ok: false, message: "month must be YYYY-MM" });
      return;
    }
    const goal = await prisma.monthlyGoal.upsert({
      where: { month },
      update: { spendGoal: spendGoal ?? null, leadsGoal: leadsGoal ?? null },
      create: { month, spendGoal: spendGoal ?? null, leadsGoal: leadsGoal ?? null },
    });
    res.json({ ok: true, goal });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/dashboard/campaigns/:platform/:campaignId/daily", async (req, res) => {
  try {
    const { platform, campaignId } = req.params;
    const days = Math.min(Math.max(parseInt(req.query.days || "30", 10) || 30, 1), 90);
    const from = buildFromDate(days);

    const rows = await prisma.campaignDaily.findMany({
      where: { platform: platform.toUpperCase(), campaignId, businessDate: { gte: from } },
      orderBy: { businessDate: "asc" },
      select: { businessDate: true, spend: true, impressions: true, clicks: true, leads: true },
    });

    const series = rows.map((r) => ({
      date: r.businessDate.toISOString().slice(0, 10),
      spend: parseFloat(Number(r.spend).toFixed(2)),
      impressions: r.impressions,
      clicks: r.clicks,
      leads: r.leads,
    }));

    res.json({ ok: true, series });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/leads", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const leads = await prisma.lead.findMany({
      orderBy: { businessDate: "desc" },
      take: limit,
    });
    res.json({ ok: true, leads });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/leads", async (req, res) => {
  try {
    const { name, phone, email, companyName, source, campaignName, notes, monthlyFeePotential } = req.body || {};
    const lead = await prisma.lead.create({
      data: {
        businessDate: toBusinessDateAtNoon(),
        name: name || null,
        phone: phone || null,
        email: email || null,
        companyName: companyName || null,
        source: source || "OTHER",
        campaignName: campaignName || null,
        notes: notes || null,
        monthlyFeePotential: monthlyFeePotential ? parseFloat(monthlyFeePotential) : null,
      },
    });
    res.status(201).json({ ok: true, lead });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.patch("/leads/:id", async (req, res) => {
  try {
    const { status, notes } = req.body || {};
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...(status ? { status } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status === "WON" ? { convertedAt: new Date() } : {}),
      },
    });
    res.json({ ok: true, lead });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/api/site/lead", requireSiteSecret, async (req, res) => {
  try {
    const { nome, email, telefone, area, urgencia, mensagem } = req.body || {};
    if (!nome && !email) return res.status(400).json({ ok: false, message: "Dados insuficientes" });

    const notes = [
      area ? `Área: ${area}` : null,
      urgencia ? `Urgência: ${urgencia}` : null,
      mensagem || null,
    ].filter(Boolean).join("\n");

    const lead = await prisma.lead.create({
      data: {
        businessDate: toBusinessDateAtNoon(),
        name: nome || null,
        email: email || null,
        phone: telefone || null,
        source: "SITE",
        campaignName: area || null,
        notes: notes || null,
      },
    });

    res.status(201).json({ ok: true, leadId: lead.id });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/notify-test", async (req, res) => {
  if (!isJobRunnerAuthorized(req)) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  const from = process.env.NOTIFY_EMAIL_FROM || "onboarding@resend.dev";

  if (!apiKey) return res.json({ ok: false, reason: "RESEND_API_KEY not set" });
  if (!to) return res.json({ ok: false, reason: "NOTIFY_EMAIL_TO not set" });

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to,
      subject: "AMR Ads — Teste de notificação",
      html: "<p>Notificação de teste do AMR Ads Control.</p>",
    });
    res.json({ ok: true, from, to, resendId: result.data?.id, error: result.error });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message, stack: err.stack });
  }
});

app.post("/jobs/weekly-report/run", async (req, res) => {
  if (!isJobRunnerAuthorized(req)) {
    res.status(401).json({ ok: false, message: "Unauthorized job execution" });
    return;
  }
  try {
    const force = req.body?.force === true;
    const result = await generateWeeklyReport({ force });
    if (result.ok) {
      const report = await prisma.weeklyReport.findUnique({ where: { id: result.reportId } });
      if (report) sendWeeklyReportEmail(report).catch((e) => console.error("[weekly-report/run] email failed:", e));
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/dashboard/weekly-report", async (_req, res) => {
  try {
    const report = await getLatestWeeklyReport();
    if (!report) {
      res.json({ ok: true, report: null });
      return;
    }
    res.json({ ok: true, report });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/", (_req, res) => {
  res.json({
    name: "Amanda Ads Backend",
    status: "running",
    health: "/health",
    databaseHealth: "/health/db",
    businessDate: "/business-date",
    adsCollection: {
      config: "/jobs/ads-collection/config",
      googleAuthCheck: "/jobs/ads-collection/google-auth-check",
      manualRun: "POST /jobs/ads-collection/run",
      recentJobs: "/jobs/ads-collection/recent",
      dailyData: "/campaigns/daily",
    },
    weeklyReport: {
      run: "POST /jobs/weekly-report/run",
      latest: "/dashboard/weekly-report",
    },
    instagram: {
      posts: "/dashboard/instagram-posts",
      collectionRun: "POST /jobs/instagram-collection/run",
      analysisRun: "POST /jobs/post-analysis/run",
    },
    scheduledPosts: {
      list:        "GET /api/scheduled-posts",
      create:      "POST /api/scheduled-posts",
      update:      "PUT /api/scheduled-posts/:id",
      cancel:      "DELETE /api/scheduled-posts/:id",
      publishNow:  "POST /api/scheduled-posts/:id/publish-now",
      publisherTickRun: "POST /jobs/post-publisher/run",
    },
  });
});

app.get("/dashboard/instagram-posts", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10) || 30, 1), 100);
    const posts = await prisma.instagramPost.findMany({
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: { analysis: true },
    });
    res.json({ ok: true, posts });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/instagram-collection/run", requireAuth, async (req, res) => {
  try {
    const result = await runInstagramCollectionJob({ triggeredBy: "http" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/post-analysis/run", requireAuth, async (req, res) => {
  try {
    const forceReanalyze = req.body?.forceReanalyze === true;
    const result = await runPostAnalysisJob({ triggeredBy: "http", forceReanalyze });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/populate-suggestions/run", requireAuth, async (req, res) => {
  try {
    const result = await runPopulateSuggestionsJob();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/content-suggestions/run", requireAuth, async (req, res) => {
  try {
    const result = await runContentSuggestionsJob({ triggeredBy: "http" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/trending-suggestions/run", requireAuth, async (req, res) => {
  try {
    const result = await runTrendingSuggestionsJob({ triggeredBy: "http" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

const AGENT_REGISTRY = [
  { jobName: "instagram_collection",  label: "Coletor de Posts",        description: "Coleta posts e métricas do @amandamramalho via Instagram Graph API." },
  { jobName: "post_analysis",         label: "Analisador de Posts",      description: "Avalia qualidade de cada post com Claude e recomenda ação (Investir, Redirecionar, Remover…)." },
  { jobName: "content_suggestions",   label: "Sugestor de Conteúdo",     description: "Analisa o histórico do perfil e sugere novos temas e formatos de post." },
  { jobName: "trending_suggestions",  label: "Agente de Tendências",     description: "Varre Conjur, JOTA, Migalhas, YouTube BR e Google Trends BR em busca de pautas em alta e sugere posts." },
  { jobName: "ads_collection",        label: "Coletor de Anúncios",      description: "Coleta métricas diárias de campanhas no Google Ads e Meta Ads." },
  { jobName: "instagram_notify",      label: "Notificador",              description: "Envia e-mail diário com posts INVEST/REMOVE e alerta de renovação do token." },
  { jobName: "post_publisher",        label: "Publicador de Posts",      description: "Publica posts agendados no Instagram (foto + carrossel) — tick a cada 5min. Gate: IG_PUBLISH_ENABLED." },
];

app.get("/dashboard/agents", async (_req, res) => {
  try {
    const jobNames = AGENT_REGISTRY.map((a) => a.jobName);
    const lastRuns = await prisma.jobExecution.findMany({
      where: { jobName: { in: jobNames } },
      orderBy: { createdAt: "desc" },
      distinct: ["jobName"],
      select: { jobName: true, status: true, finishedAt: true, startedAt: true, details: true, errorMessage: true },
    });
    const byName = Object.fromEntries(lastRuns.map((r) => [r.jobName, r]));
    const agents = AGENT_REGISTRY.map((a) => ({ ...a, lastRun: byName[a.jobName] || null }));
    res.json({ ok: true, agents });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/dashboard/content-suggestions", async (req, res) => {
  try {
    const suggestions = await prisma.contentSuggestion.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, suggestions });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.patch("/content-suggestions/:id", requireAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    const updated = await prisma.contentSuggestion.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json({ ok: true, suggestion: updated });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/admin-alert/test", requireAuth, async (req, res) => {
  try {
    const result = await sendAdminAlert({
      subject: "🔴 AMR Ads — Teste de alerta crítico",
      title: "Token do Instagram expirado (simulado)",
      body: "Este e um teste do sistema de alerta de erros criticos.",
      steps: [
        "Acesse o Graph API Explorer: https://developers.facebook.com/tools/explorer/",
        "Selecione o app AMR Controles",
        "Adicione as permissoes: instagram_business_basic, instagram_manage_comments",
        "Gere o token e cole em Render → INSTAGRAM_ACCESS_TOKEN",
        "Atualize INSTAGRAM_TOKEN_ISSUED_DATE para a data de hoje",
      ],
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

// ─── Agendamento e Publicação Instagram (Fase 1) ──────────────────────────────
// Plano completo: Depósito/Plano — Agendamento e Publicação Instagram.html

app.get("/api/scheduled-posts", requireAuth, async (req, res) => {
  try {
    const { status, dateFrom, dateTo, suggestionId } = req.query;
    const where = {};
    if (status) where.status = String(status);
    if (suggestionId) where.suggestionId = String(suggestionId);
    if (dateFrom || dateTo) {
      where.scheduledFor = {};
      if (dateFrom) where.scheduledFor.gte = new Date(String(dateFrom));
      if (dateTo)   where.scheduledFor.lte = new Date(String(dateTo));
    }
    const posts = await prisma.scheduledPost.findMany({
      where,
      orderBy: { scheduledFor: "asc" },
      include: { suggestion: { select: { id: true, theme: true, format: true } } },
    });
    res.json({ ok: true, posts });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/api/scheduled-posts", requireAuth, async (req, res) => {
  try {
    const { caption, mediaUrls, format, scheduledFor, suggestionId, firstComment, status } = req.body || {};
    if (!caption || !Array.isArray(mediaUrls) || !mediaUrls.length || !format || !scheduledFor) {
      return res.status(400).json({ ok: false, message: "Campos obrigatórios: caption, mediaUrls[], format, scheduledFor" });
    }
    if (format === "CAROUSEL" && (mediaUrls.length < 2 || mediaUrls.length > 10)) {
      return res.status(400).json({ ok: false, message: "Carrossel exige entre 2 e 10 imagens" });
    }
    const post = await prisma.scheduledPost.create({
      data: {
        caption,
        mediaUrls,
        format,
        firstComment: firstComment || null,
        scheduledFor: new Date(scheduledFor),
        suggestionId: suggestionId || null,
        status: status === "DRAFT" ? "DRAFT" : "SCHEDULED",
      },
    });
    res.status(201).json({ ok: true, post });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.put("/api/scheduled-posts/:id", requireAuth, async (req, res) => {
  try {
    const current = await prisma.scheduledPost.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ ok: false, message: "Post agendado não encontrado" });
    if (!["DRAFT", "SCHEDULED"].includes(current.status)) {
      return res.status(400).json({ ok: false, message: `Não é possível editar post com status ${current.status}` });
    }
    const { caption, mediaUrls, format, scheduledFor, firstComment, status } = req.body || {};
    const data = {};
    if (caption !== undefined)      data.caption = caption;
    if (mediaUrls !== undefined)    data.mediaUrls = mediaUrls;
    if (format !== undefined)       data.format = format;
    if (scheduledFor !== undefined) data.scheduledFor = new Date(scheduledFor);
    if (firstComment !== undefined) data.firstComment = firstComment || null;
    if (status !== undefined && ["DRAFT", "SCHEDULED"].includes(status)) data.status = status;
    const post = await prisma.scheduledPost.update({ where: { id: req.params.id }, data });
    res.json({ ok: true, post });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.delete("/api/scheduled-posts/:id", requireAuth, async (req, res) => {
  try {
    const post = await prisma.scheduledPost.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED" },
    });
    res.json({ ok: true, post });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/api/scheduled-posts/:id/publish-now", requireAuth, async (req, res) => {
  try {
    const result = await publishNow(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/post-publisher/run", requireAuth, async (_req, res) => {
  try {
    const result = await runPostPublisherTick({ triggeredBy: "http" });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/jobs/instagram-notify/test", requireAuth, async (req, res) => {
  const job = await prisma.jobExecution.create({
    data: { jobName: "instagram_notify", status: "RUNNING", attempt: 1, startedAt: new Date(), details: { trigger: "http" } },
  });
  try {
    const { prisma: db } = await import("./lib/prisma.js");

    // Posts REMOVE reais
    const removeReal = await db.postAnalysis.findMany({
      where: { action: "REMOVE" },
      include: { post: true },
      orderBy: { score: "asc" },
      take: 3,
    });

    // Posts INVEST reais (ou simula com o melhor post)
    let investPosts = await db.postAnalysis.findMany({
      where: { action: "INVEST" },
      include: { post: true },
      orderBy: { score: "desc" },
      take: 3,
    });

    let simulated = false;
    if (investPosts.length === 0) {
      simulated = true;
      const best = await db.postAnalysis.findFirst({
        orderBy: { score: "desc" },
        include: { post: true },
      });
      if (best) {
        investPosts = [{
          ...best,
          action: "INVEST",
          score: 8,
          reasoning: "(SIMULADO) Post com maior engajamento do perfil — bom candidato para impulsionar com ads.",
          simulated: true,
        }];
      }
    }

    const result = await sendInstagramAnalysisEmail({
      investPosts: investPosts.map((p) => ({ post: p.post, analysis: p, simulated: p.simulated })),
      removePosts: removeReal.map((p) => ({ post: p.post, analysis: p })),
      tokenDaysUsed: getTokenDaysUsed(),
      simulated,
    });

    await prisma.jobExecution.update({
      where: { id: job.id },
      data: {
        status: result?.sent ? "SUCCESS" : "FAILED",
        finishedAt: new Date(),
        details: { trigger: "http", simulated, invest: investPosts.length, remove: removeReal.length, ...result },
        errorMessage: result?.sent ? null : (result?.reason || result?.error || "unknown"),
      },
    });

    res.json({ ok: true, simulated, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await prisma.jobExecution.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: message.slice(0, 500) },
    });
    res.status(500).json({ ok: false, message });
  }
});

const schedulerState = startAdsScheduler();
console.log("Ads scheduler state:", schedulerState);
startWeeklyReportScheduler();
const igSchedulerState = startInstagramScheduler();
console.log("Instagram scheduler state:", igSchedulerState);
const publisherState = startPostPublisherScheduler();
console.log("Post publisher scheduler state:", publisherState);

const server = app.listen(PORT, () => {
  console.log(`Amanda backend running on port ${PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  stopAdsScheduler();
  stopWeeklyReportScheduler();
  stopInstagramScheduler();
  stopPostPublisherScheduler();

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
