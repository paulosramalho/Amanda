import { prisma } from "../lib/prisma.js";
import { toBusinessDateAtNoon } from "../lib/businessDate.js";
import { sendAnomalyAlert } from "../lib/notify.js";

function safeNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function runAnomalyDetection() {
  const today = toBusinessDateAtNoon();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const [todayRows, prevRows] = await Promise.all([
    prisma.campaignDaily.findMany({ where: { businessDate: today } }),
    prisma.campaignDaily.findMany({
      where: { businessDate: { gte: sevenDaysAgo, lt: today } },
    }),
  ]);

  if (todayRows.length === 0) return { skipped: true, reason: "no data for today" };

  const todaySpend = todayRows.reduce((s, r) => s + safeNum(r.spend), 0);
  const todayLeads = todayRows.reduce((s, r) => s + r.leads, 0);

  const prevDays = prevRows.length > 0 ? Math.max(1, new Set(prevRows.map((r) => r.businessDate.toISOString().slice(0, 10))).size) : 0;
  const prevAvgSpend = prevDays > 0 ? prevRows.reduce((s, r) => s + safeNum(r.spend), 0) / prevDays : 0;
  const prevAvgLeads = prevDays > 0 ? prevRows.reduce((s, r) => s + r.leads, 0) / prevDays : 0;

  const anomalies = [];

  if (prevAvgSpend > 0 && todaySpend > prevAvgSpend * 1.5) {
    anomalies.push({
      type: "Pico de gasto",
      message: `Gasto hoje: R$ ${todaySpend.toFixed(2)} — ${((todaySpend / prevAvgSpend - 1) * 100).toFixed(0)}% acima da média dos últimos 7 dias (R$ ${prevAvgSpend.toFixed(2)}/dia)`,
    });
  }

  if (prevAvgSpend > 0 && todaySpend < prevAvgSpend * 0.4 && todaySpend > 0) {
    anomalies.push({
      type: "Queda brusca de gasto",
      message: `Gasto hoje: R$ ${todaySpend.toFixed(2)} — ${((1 - todaySpend / prevAvgSpend) * 100).toFixed(0)}% abaixo da média dos últimos 7 dias (R$ ${prevAvgSpend.toFixed(2)}/dia)`,
    });
  }

  if (todaySpend > 5 && todayLeads === 0 && prevAvgLeads > 0) {
    anomalies.push({
      type: "Gasto sem leads",
      message: `R$ ${todaySpend.toFixed(2)} investidos hoje sem nenhum lead — média anterior era ${prevAvgLeads.toFixed(1)} leads/dia`,
    });
  }

  if (todaySpend === 0 && prevAvgSpend > 5) {
    anomalies.push({
      type: "Zero gasto hoje",
      message: `Nenhum gasto registrado hoje — média anterior era R$ ${prevAvgSpend.toFixed(2)}/dia. Verificar se campanhas estão ativas`,
    });
  }

  if (anomalies.length > 0) {
    console.log(`[anomaly-detector] ${anomalies.length} anomalia(s) detectada(s)`);
    await sendAnomalyAlert(anomalies);
  }

  return { anomalies };
}
