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

  res.status(200).json({
    ok: true,
    jobName: getAdsCollectionJobName(),
    scheduler,
    providers: {
      googleAdsEnabled: String(process.env.GOOGLE_ADS_ENABLED || "false"),
      metaAdsEnabled: String(process.env.META_ADS_ENABLED || "false"),
    },
  });
});

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

app.get("/", (_req, res) => {
  res.json({
    name: "Amanda Ads Backend",
    status: "running",
    health: "/health",
    databaseHealth: "/health/db",
    businessDate: "/business-date",
    adsCollection: {
      config: "/jobs/ads-collection/config",
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
