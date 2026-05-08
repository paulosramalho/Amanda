// Cockpit de Agentes — reporter drop-in.
// Copie este arquivo para `<projeto>/backend/src/lib/agentReporter.js`.
// Falhas de comunicação com o cockpit NUNCA derrubam o agente original.

function logWarn(...args) {
  console.warn("[cockpit-reporter]", ...args);
}

async function safePost(url, token, body, timeoutMs = 5000) {
  if (!url || !token) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      logWarn(`POST ${url} -> ${res.status}`);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (err) {
    logWarn("falha POST", url, err?.message || err);
    return null;
  }
}

export function createReporter(opts = {}) {
  const cockpitUrl = opts.cockpitUrl || process.env.COCKPIT_URL || "";
  const projectToken = opts.projectToken || process.env.COCKPIT_PROJECT_TOKEN || "";
  const enabled = Boolean(cockpitUrl && projectToken);
  const projectSlug = opts.projectSlug || process.env.COCKPIT_PROJECT_SLUG || "";

  if (!enabled) {
    logWarn(`desabilitado (COCKPIT_URL=${!!cockpitUrl}, COCKPIT_PROJECT_TOKEN=${!!projectToken})`);
  }

  async function registerAgents(agents) {
    if (!enabled) return;
    if (!Array.isArray(agents) || agents.length === 0) return;
    await safePost(`${cockpitUrl}/api/ingest/register`, projectToken, { agents });
  }

  async function start(agentName, attempt = 1) {
    if (!enabled) return null;
    const r = await safePost(`${cockpitUrl}/api/ingest/start`, projectToken, { agentName, attempt });
    return r?.executionId || null;
  }

  async function finish(executionId, status, payload = {}) {
    if (!enabled || !executionId) return;
    await safePost(`${cockpitUrl}/api/ingest/finish`, projectToken, {
      executionId,
      status,
      details: payload.details ?? null,
      errorMessage: payload.errorMessage ?? null,
    });
  }

  async function heartbeat(agentName) {
    if (!enabled) return;
    await safePost(`${cockpitUrl}/api/ingest/heartbeat`, projectToken, { agentName });
  }

  async function run(agentName, fn, options = {}) {
    const attempt = options.attempt || 1;
    const executionId = await start(agentName, attempt);
    try {
      const result = await fn();
      await finish(executionId, "SUCCESS", { details: options.details ?? null });
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await finish(executionId, "FAILED", { errorMessage });
      throw err;
    }
  }

  return {
    enabled,
    projectSlug,
    registerAgents,
    start,
    finish,
    heartbeat,
    run,
  };
}
