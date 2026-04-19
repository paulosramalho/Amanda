import { prisma } from "../lib/prisma.js";
import { toBusinessDateAtNoon } from "../lib/businessDate.js";

function safeNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function brl(v) {
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildFromDate(days) {
  const today = toBusinessDateAtNoon();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return from;
}

function aggregateCampaigns(rows) {
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
  return Object.values(byCampaign).map((c) => ({
    ...c,
    spend: parseFloat(c.spend.toFixed(2)),
    cpl: c.leads > 0 ? parseFloat((c.spend / c.leads).toFixed(2)) : null,
    ctr: c.impressions > 0 ? parseFloat((c.clicks / c.impressions * 100).toFixed(2)) : null,
  }));
}

function generateReportText(campaigns, totals, prevTotals) {
  const spendChange = prevTotals.spend > 0
    ? ((totals.spend - prevTotals.spend) / prevTotals.spend * 100).toFixed(0)
    : null;
  const leadsChange = prevTotals.leads > 0
    ? ((totals.leads - prevTotals.leads) / prevTotals.leads * 100).toFixed(0)
    : null;

  const withLeads = campaigns.filter((c) => c.leads > 0).sort((a, b) => a.cpl - b.cpl);
  const noLeads = campaigns.filter((c) => c.leads === 0 && c.spend > 0);
  const bestCpl = withLeads[0] || null;

  const whatWorked = [];
  const whatToPause = [];
  const whereToScale = [];
  const recommendations = [];

  if (withLeads.length === 0) {
    whatWorked.push("Nenhuma campanha gerou leads nesta semana.");
  } else {
    for (const c of withLeads) {
      whatWorked.push(
        `${c.campaignName} (${platformLabel(c.platform)}): ${c.leads} lead${c.leads > 1 ? "s" : ""} — CPL ${brl(c.cpl)}, CTR ${c.ctr ?? "—"}%`
      );
    }
  }

  for (const c of noLeads) {
    whatToPause.push(
      `${c.campaignName} (${platformLabel(c.platform)}): ${brl(c.spend)} investidos sem nenhum lead — revisar criativo ou pausar`
    );
  }

  if (bestCpl) {
    whereToScale.push(
      `${bestCpl.campaignName} (${platformLabel(bestCpl.platform)}): melhor CPL da semana (${brl(bestCpl.cpl)}) — candidata a aumento de orçamento`
    );
  }

  if (totals.spend > 0 && totals.leads === 0) {
    recommendations.push({ priority: "alta", action: "Revisar criativos e segmentação — nenhuma conversão no período" });
  }
  if (spendChange && Number(spendChange) > 50) {
    recommendations.push({ priority: "média", action: `Gasto aumentou ${spendChange}% vs semana anterior — monitorar CPL` });
  }
  if (spendChange && Number(spendChange) < -30) {
    recommendations.push({ priority: "média", action: `Gasto caiu ${Math.abs(spendChange)}% vs semana anterior — verificar campanhas pausadas` });
  }
  if (leadsChange && Number(leadsChange) > 0) {
    recommendations.push({ priority: "info", action: `Leads cresceram ${leadsChange}% vs semana anterior — manter estratégia` });
  }

  return {
    whatWorked: whatWorked.join("\n"),
    whatToPause: whatToPause.join("\n") || "Nenhuma campanha identificada para pausar.",
    whereToScale: whereToScale.join("\n") || "Aguardando dados suficientes para identificar campanhas para escalar.",
    recommendations,
    meta: {
      spend: totals.spend,
      leads: totals.leads,
      cpl: totals.cpl,
      impressions: totals.impressions,
      clicks: totals.clicks,
      spendChangePct: spendChange ? Number(spendChange) : null,
      leadsChangePct: leadsChange ? Number(leadsChange) : null,
    },
  };
}

function platformLabel(platform) {
  return platform === "GOOGLE_ADS" ? "Google Ads" : platform === "META_ADS" ? "Meta Ads" : platform;
}

function getWeekBounds() {
  const today = toBusinessDateAtNoon();
  const weekEnd = new Date(today);
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  return { weekStart, weekEnd };
}

export async function generateWeeklyReport({ force = false } = {}) {
  const { weekStart, weekEnd } = getWeekBounds();

  if (!force) {
    const existing = await prisma.weeklyReport.findFirst({
      where: { weekStartDate: weekStart, weekEndDate: weekEnd, scope: "global" },
    });
    if (existing) return { skipped: true, reason: "Report already exists for this week", reportId: existing.id };
  }

  const [currentRows, prevRows] = await Promise.all([
    prisma.campaignDaily.findMany({ where: { businessDate: { gte: weekStart, lte: weekEnd } } }),
    prisma.campaignDaily.findMany({
      where: {
        businessDate: {
          gte: new Date(weekStart.getTime() - 7 * 24 * 3600 * 1000),
          lt: weekStart,
        },
      },
    }),
  ]);

  const campaigns = aggregateCampaigns(currentRows);

  const totals = campaigns.reduce(
    (acc, c) => ({ spend: acc.spend + c.spend, leads: acc.leads + c.leads, impressions: acc.impressions + c.impressions, clicks: acc.clicks + c.clicks }),
    { spend: 0, leads: 0, impressions: 0, clicks: 0 }
  );
  totals.cpl = totals.leads > 0 ? parseFloat((totals.spend / totals.leads).toFixed(2)) : null;

  const prevCampaigns = aggregateCampaigns(prevRows);
  const prevTotals = prevCampaigns.reduce(
    (acc, c) => ({ spend: acc.spend + c.spend, leads: acc.leads + c.leads }),
    { spend: 0, leads: 0 }
  );

  const { whatWorked, whatToPause, whereToScale, recommendations, meta } = generateReportText(campaigns, totals, prevTotals);

  const report = await prisma.weeklyReport.upsert({
    where: { weekStartDate_weekEndDate_scope: { weekStartDate: weekStart, weekEndDate: weekEnd, scope: "global" } },
    update: { whatWorked, whatToPause, whereToScale, recommendations: { summary: meta, items: recommendations }, generatedAt: new Date() },
    create: { weekStartDate: weekStart, weekEndDate: weekEnd, scope: "global", whatWorked, whatToPause, whereToScale, recommendations: { summary: meta, items: recommendations } },
  });

  return { ok: true, reportId: report.id, weekStart: weekStart.toISOString().slice(0, 10), weekEnd: weekEnd.toISOString().slice(0, 10), meta };
}

export async function getLatestWeeklyReport() {
  return prisma.weeklyReport.findFirst({
    orderBy: { weekStartDate: "desc" },
  });
}
