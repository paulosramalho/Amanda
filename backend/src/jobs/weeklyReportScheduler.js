import { generateWeeklyReport } from "./weeklyReportJob.js";
import { sendWeeklyReportEmail } from "../lib/notify.js";
import { prisma } from "../lib/prisma.js";

const TICK_MS = 60_000;
const RUN_UTC_HOUR = 12;
const RUN_UTC_MINUTE = 0;
const RUN_UTC_DAY = 1; // Monday

let timer = null;
let lastRunKey = null;

function buildRunKey(now) {
  const week = now.toISOString().slice(0, 10);
  return `weekly_${week}`;
}

async function tickScheduler() {
  const now = new Date();
  if (now.getUTCDay() !== RUN_UTC_DAY) return;
  if (now.getUTCHours() !== RUN_UTC_HOUR) return;
  if (now.getUTCMinutes() !== RUN_UTC_MINUTE) return;

  const runKey = buildRunKey(now);
  if (lastRunKey === runKey) return;
  lastRunKey = runKey;

  try {
      const result = await generateWeeklyReport({ force: false });
      console.log("[weekly-report-scheduler] Generated:", result);
      if (result.ok) {
        const { prisma } = await import("../lib/prisma.js");
        const report = await prisma.weeklyReport.findUnique({ where: { id: result.reportId } });
        if (report) await sendWeeklyReportEmail(report);
      }
  } catch (error) {
    console.error("[weekly-report-scheduler] Failed:", error);
  }
}

async function catchUpIfNeeded() {
  const now = new Date();
  if (now.getUTCDay() !== RUN_UTC_DAY) return;
  if (now.getUTCHours() < RUN_UTC_HOUR) return;

  const todayISO = now.toISOString().slice(0, 10);
  const dayStart = new Date(`${todayISO}T00:00:00Z`);

  const ran = await prisma.weeklyReport.findFirst({ where: { createdAt: { gte: dayStart } } });
  if (ran) return;

  console.log("[weekly-report-scheduler] Catch-up: relatório desta segunda não encontrado — gerando agora");
  try {
    const result = await generateWeeklyReport({ force: false });
    if (result?.ok) {
      const report = await prisma.weeklyReport.findUnique({ where: { id: result.reportId } });
      if (report) await sendWeeklyReportEmail(report).catch(() => {});
    }
  } catch (e) {
    console.error("[weekly-report-scheduler] Catch-up failed:", e.message);
  }
}

export function startWeeklyReportScheduler() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void tickScheduler(); }, TICK_MS);
  void catchUpIfNeeded();
  console.log("[weekly-report-scheduler] Started — runs every Monday at 12:00 UTC (09:00 BRT)");
}

export function stopWeeklyReportScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
