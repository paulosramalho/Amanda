import { generateWeeklyReport } from "./weeklyReportJob.js";
import { sendWeeklyReportEmail } from "../lib/notify.js";

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

export function startWeeklyReportScheduler() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void tickScheduler(); }, TICK_MS);
  console.log("[weekly-report-scheduler] Started — runs every Monday at 12:00 UTC (09:00 BRT)");
}

export function stopWeeklyReportScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
