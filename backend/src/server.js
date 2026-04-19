import "dotenv/config";
import cors from "cors";
import express from "express";
import { prisma } from "./lib/prisma.js";
import { toBusinessDateAtNoon, toBusinessDateIsoString } from "./lib/businessDate.js";
import {
  getAdsCollectionJobName,
  listCampaignDailyRows,
  listRecentAdsCollectionJobs,
  runAdsCollectionJob,
} from "./jobs/adsCollectionJob.js";
import { getAdsSchedulerState, startAdsScheduler, stopAdsScheduler } from "./jobs/adsScheduler.js";
import {
  getGoogleAdsAuthRuntimeDebug,
  probeGoogleAdsAuthentication,
} from "./jobs/ads/providers/googleAds.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function isJobRunnerAuthorized(req) {
  const configuredApiKey = process.env.JOB_RUNNER_API_KEY;

  if (!configuredApiKey) {
    return true;
  }

  const receivedApiKey = req.header("x-api-key") || req.header("authorization")?.replace("Bearer ", "");
  return receivedApiKey === configuredApiKey;
}

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
  if (!isJobRunnerAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Unauthorized job execution",
    });
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
      alerts.push({ type: "no_leads", message: `Nenhum lead no período com R$ ${totals.spend.toFixed(2)} investidos` });
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
  });
});

const schedulerState = startAdsScheduler();
console.log("Ads scheduler state:", schedulerState);

const server = app.listen(PORT, () => {
  console.log(`Amanda backend running on port ${PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  stopAdsScheduler();

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
