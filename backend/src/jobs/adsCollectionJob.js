import { prisma } from "../lib/prisma.js";
import {
  parseDateOnlyToBusinessDate,
  shiftBusinessDateDays,
  toBusinessDateAtNoon,
  toBusinessDateDateOnlyString,
  toBusinessDateIsoString,
} from "../lib/businessDate.js";
import { collectGoogleAdsCampaignMetrics } from "./ads/providers/googleAds.js";
import { collectMetaAdsCampaignMetrics } from "./ads/providers/metaAds.js";

const ADS_COLLECTION_JOB_NAME = "ads_collection";

function toInteger(value, defaultValue = 0) {
  const parsed = Number.parseInt(String(value ?? defaultValue), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function sanitizeCurrency(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(2));
}

function sanitizeRatio(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Number(numeric.toFixed(4));
}

function safeDivide(numerator, denominator) {
  if (!denominator) {
    return null;
  }

  return numerator / denominator;
}

function resolveBusinessDate(inputDate) {
  if (inputDate instanceof Date) {
    return toBusinessDateAtNoon(inputDate);
  }

  if (typeof inputDate === "string" && inputDate.trim()) {
    return parseDateOnlyToBusinessDate(inputDate.trim());
  }

  const offsetDays = toInteger(process.env.ADS_COLLECTION_DAYS_OFFSET, -1);
  return shiftBusinessDateDays(toBusinessDateAtNoon(), offsetDays);
}

function normalizeCampaign(row) {
  const impressions = toInteger(row.impressions);
  const clicks = toInteger(row.clicks);
  const leads = toInteger(row.leads);
  const qualifiedLeads = toInteger(row.qualifiedLeads);
  const spend = sanitizeCurrency(row.spend);

  return {
    platform: String(row.platform || "OTHER"),
    accountId: row.accountId ? String(row.accountId) : null,
    campaignId: String(row.campaignId || "UNKNOWN_CAMPAIGN"),
    campaignName: row.campaignName ? String(row.campaignName) : "Unnamed campaign",
    impressions,
    clicks,
    leads,
    qualifiedLeads,
    spend,
    cpl: sanitizeRatio(safeDivide(spend, leads)),
    cpc: sanitizeRatio(safeDivide(spend, clicks)),
    ctr: sanitizeRatio(safeDivide(clicks, impressions)),
    conversionRate: sanitizeRatio(safeDivide(leads, clicks)),
    rawPayload: row.rawPayload || null,
  };
}

function toPersistenceData(campaign) {
  return {
    platform: campaign.platform,
    accountId: campaign.accountId,
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    spend: campaign.spend,
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    leads: campaign.leads,
    qualifiedLeads: campaign.qualifiedLeads,
    cpl: campaign.cpl,
    cpc: campaign.cpc,
    ctr: campaign.ctr,
    conversionRate: campaign.conversionRate,
    rawPayload: campaign.rawPayload,
  };
}

async function upsertCampaignDailyRecord({ businessDate, campaign }) {
  const existing = await prisma.campaignDaily.findFirst({
    where: {
      businessDate,
      platform: campaign.platform,
      campaignId: campaign.campaignId,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.campaignDaily.update({
      where: { id: existing.id },
      data: toPersistenceData(campaign),
    });
  }

  return prisma.campaignDaily.create({
    data: {
      businessDate,
      ...toPersistenceData(campaign),
    },
  });
}

export async function runAdsCollectionJob({ triggeredBy = "manual", date } = {}) {
  const businessDate = resolveBusinessDate(date);
  const businessDateIso = toBusinessDateIsoString(businessDate);
  const businessDateOnly = toBusinessDateDateOnlyString(businessDate);

  const job = await prisma.jobExecution.create({
    data: {
      jobName: ADS_COLLECTION_JOB_NAME,
      status: "RUNNING",
      attempt: 1,
      scheduledFor: businessDate,
      startedAt: new Date(),
      details: {
        trigger: triggeredBy,
        targetDate: businessDateOnly,
      },
    },
  });

  try {
    const [googleResult, metaResult] = await Promise.all([
      collectGoogleAdsCampaignMetrics({ dateOnly: businessDateOnly }),
      collectMetaAdsCampaignMetrics({ dateOnly: businessDateOnly }),
    ]);

    const normalizedCampaigns = [...googleResult.campaigns, ...metaResult.campaigns].map(normalizeCampaign);

    let upserted = 0;
    for (const campaign of normalizedCampaigns) {
      await upsertCampaignDailyRecord({ businessDate, campaign });
      upserted += 1;
    }

    const details = {
      trigger: triggeredBy,
      targetDate: businessDateOnly,
      targetDateIso: businessDateIso,
      providers: {
        google: {
          status: googleResult.status,
          reason: googleResult.reason || null,
          accountId: googleResult.accountId,
          campaigns: googleResult.campaigns.length,
        },
        meta: {
          status: metaResult.status,
          reason: metaResult.reason || null,
          accountId: metaResult.accountId,
          campaigns: metaResult.campaigns.length,
        },
      },
      totalCampaignsFetched: normalizedCampaigns.length,
      totalUpserted: upserted,
    };

    await prisma.jobExecution.update({
      where: { id: job.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        details,
      },
    });

    return {
      ok: true,
      jobId: job.id,
      ...details,
    };
  } catch (error) {
    await prisma.jobExecution.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "unknown error",
      },
    });

    throw error;
  }
}

export async function listRecentAdsCollectionJobs(limit = 20) {
  const safeLimit = Math.max(1, Math.min(toInteger(limit, 20), 100));

  return prisma.jobExecution.findMany({
    where: { jobName: ADS_COLLECTION_JOB_NAME },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
}

export async function listCampaignDailyRows({ date, platform, limit = 200 } = {}) {
  const where = {};

  if (date) {
    where.businessDate = resolveBusinessDate(date);
  }

  if (platform) {
    where.platform = String(platform).trim().toUpperCase();
  }

  return prisma.campaignDaily.findMany({
    where,
    orderBy: [
      { businessDate: "desc" },
      { platform: "asc" },
      { campaignName: "asc" },
    ],
    take: Math.max(1, Math.min(toInteger(limit, 200), 1000)),
  });
}

export function getAdsCollectionJobName() {
  return ADS_COLLECTION_JOB_NAME;
}
