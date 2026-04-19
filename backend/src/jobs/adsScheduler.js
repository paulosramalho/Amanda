import { runAdsCollectionJob } from "./adsCollectionJob.js";
import { runAnomalyDetection } from "./anomalyDetector.js";

const DEFAULT_TICK_MS = 60_000;
const DEFAULT_RUN_UTC_HOUR = 15;
const DEFAULT_RUN_UTC_MINUTE = 0;

const schedulerState = {
  started: false,
  runUtcHour: DEFAULT_RUN_UTC_HOUR,
  runUtcMinute: DEFAULT_RUN_UTC_MINUTE,
  tickMs: DEFAULT_TICK_MS,
  lastRunKey: null,
};

let timer = null;

function toBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function toInteger(value, defaultValue) {
  const parsed = Number.parseInt(String(value ?? defaultValue), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function buildRunKey(nowUtcDate, runHour, runMinute) {
  return `${nowUtcDate.toISOString().slice(0, 10)}_${String(runHour).padStart(2, "0")}:${String(runMinute).padStart(2, "0")}`;
}

async function tickScheduler() {
  const now = new Date();
  const shouldRunNow =
    now.getUTCHours() === schedulerState.runUtcHour &&
    now.getUTCMinutes() === schedulerState.runUtcMinute;

  if (!shouldRunNow) {
    return;
  }

  const runKey = buildRunKey(now, schedulerState.runUtcHour, schedulerState.runUtcMinute);

  if (schedulerState.lastRunKey === runKey) {
    return;
  }

  schedulerState.lastRunKey = runKey;

  try {
    await runAdsCollectionJob({ triggeredBy: "scheduler" });
  } catch (error) {
    console.error("[ads-scheduler] Daily collection failed:", error);
  }

  try {
    await runAnomalyDetection();
  } catch (error) {
    console.error("[ads-scheduler] Anomaly detection failed:", error);
  }
}

export function startAdsScheduler() {
  const enabled = toBoolean(process.env.ADS_COLLECTION_SCHEDULER_ENABLED, false);

  schedulerState.runUtcHour = Math.min(
    23,
    Math.max(0, toInteger(process.env.ADS_COLLECTION_RUN_UTC_HOUR, DEFAULT_RUN_UTC_HOUR)),
  );
  schedulerState.runUtcMinute = Math.min(
    59,
    Math.max(0, toInteger(process.env.ADS_COLLECTION_RUN_UTC_MINUTE, DEFAULT_RUN_UTC_MINUTE)),
  );
  schedulerState.tickMs = Math.max(15_000, toInteger(process.env.ADS_COLLECTION_SCHEDULER_TICK_MS, DEFAULT_TICK_MS));

  if (!enabled) {
    schedulerState.started = false;
    return { ...schedulerState, enabled };
  }

  if (timer) {
    clearInterval(timer);
  }

  timer = setInterval(() => {
    void tickScheduler();
  }, schedulerState.tickMs);

  schedulerState.started = true;
  void tickScheduler();

  return { ...schedulerState, enabled };
}

export function stopAdsScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  schedulerState.started = false;
}

export function getAdsSchedulerState() {
  return { ...schedulerState };
}
