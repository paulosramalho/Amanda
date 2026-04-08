const GOOGLE_PLATFORM = "GOOGLE_ADS";
const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const OAUTH_TOKEN_REFRESH_SAFETY_MARGIN_SECONDS = 60;

const accessTokenCache = {
  token: "",
  expiresAtMs: 0,
};

function toBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function toInteger(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value) {
  const parsed = Number(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSecret(value) {
  if (value === undefined || value === null) {
    return "";
  }

  let normalized = String(value).trim();

  if (
    (normalized.startsWith("\"") && normalized.endsWith("\"")) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.toLowerCase().startsWith("bearer ")) {
    normalized = normalized.slice(7).trim();
  }

  return normalized;
}

function normalizeCustomerId(value) {
  const normalized = normalizeSecret(value);
  if (!normalized) {
    return "";
  }

  return normalized.replace(/\D/g, "");
}

function validateAccessTokenFormat(accessToken) {
  if (!accessToken) {
    return;
  }

  if (accessToken.startsWith("{") || accessToken.includes("\"scope\"")) {
    throw new Error(
      "GOOGLE_ADS_ACCESS_TOKEN appears to be JSON. Paste only the raw access token string (example: starts with ya29.).",
    );
  }

  if (accessToken.startsWith("1//")) {
    throw new Error(
      "GOOGLE_ADS_ACCESS_TOKEN appears to be a refresh token (starts with 1//). Paste the access token (starts with ya29.).",
    );
  }

  if (/\s/.test(accessToken) || accessToken.length < 20) {
    throw new Error(
      "GOOGLE_ADS_ACCESS_TOKEN format is unexpected. Expected only the raw OAuth access token.",
    );
  }
}

function getGoogleOauthRefreshConfig() {
  return {
    clientId: normalizeSecret(process.env.GOOGLE_ADS_CLIENT_ID),
    clientSecret: normalizeSecret(process.env.GOOGLE_ADS_CLIENT_SECRET),
    refreshToken: normalizeSecret(process.env.GOOGLE_ADS_REFRESH_TOKEN),
    tokenUrl: normalizeSecret(process.env.GOOGLE_ADS_TOKEN_URL) || GOOGLE_OAUTH_TOKEN_ENDPOINT,
  };
}

function hasAnyRefreshConfig(oauthConfig) {
  return Boolean(oauthConfig.clientId || oauthConfig.clientSecret || oauthConfig.refreshToken);
}

function hasCompleteRefreshConfig(oauthConfig) {
  return Boolean(oauthConfig.clientId && oauthConfig.clientSecret && oauthConfig.refreshToken);
}

async function fetchAccessTokenFromRefreshToken(oauthConfig) {
  const now = Date.now();
  if (accessTokenCache.token && accessTokenCache.expiresAtMs > now) {
    return accessTokenCache.token;
  }

  const response = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      refresh_token: oauthConfig.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google OAuth refresh failed (${response.status}): ${errorBody.slice(0, 300)}`,
    );
  }

  const payload = await response.json();
  const accessToken = normalizeSecret(payload.access_token);
  if (!accessToken) {
    throw new Error("Google OAuth refresh succeeded but did not return access_token.");
  }

  const expiresInSeconds = Number(payload.expires_in || 3600);
  const cacheDurationMs =
    Math.max(60, expiresInSeconds - OAUTH_TOKEN_REFRESH_SAFETY_MARGIN_SECONDS) * 1000;

  accessTokenCache.token = accessToken;
  accessTokenCache.expiresAtMs = now + cacheDurationMs;

  return accessToken;
}

function truncateText(value, limit = 300) {
  return String(value ?? "").slice(0, limit);
}

function parseAccessibleCustomerIds(resourceNames = []) {
  const parsed = (resourceNames || [])
    .map((resourceName) => String(resourceName || "").trim())
    .filter(Boolean)
    .map((resourceName) => resourceName.replace(/^customers\//i, ""))
    .map((customerId) => customerId.replace(/\D/g, ""))
    .filter(Boolean);

  return [...new Set(parsed)].sort();
}

function buildProbeError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "unknown error");
}

async function inspectAccessToken(accessToken) {
  const endpoint = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(endpoint, { method: "GET" });

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      ok: false,
      status: response.status,
      error: truncateText(errorBody, 500),
    };
  }

  const payload = await response.json();
  const scopes = String(payload.scope || "")
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    ok: true,
    status: response.status,
    expiresInSeconds: toInteger(payload.expires_in),
    audience: payload.aud || null,
    authorizedParty: payload.azp || null,
    hasAdwordsScope: scopes.includes("https://www.googleapis.com/auth/adwords"),
    scopes,
  };
}

async function fetchAccessibleCustomers({ accessToken, developerToken, loginCustomerId, version }) {
  const endpoint = `https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      ok: false,
      status: response.status,
      error: truncateText(errorBody, 500),
    };
  }

  const payload = await response.json();
  const customerIds = parseAccessibleCustomerIds(payload.resourceNames || []);

  return {
    ok: true,
    status: response.status,
    customerIds,
    count: customerIds.length,
  };
}

export async function collectGoogleAdsCampaignMetrics({ dateOnly }) {
  const enabled = toBoolean(process.env.GOOGLE_ADS_ENABLED, false);
  const configuredCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);

  if (!enabled) {
    return {
      provider: GOOGLE_PLATFORM,
      status: "skipped",
      reason: "GOOGLE_ADS_ENABLED is false",
      accountId: configuredCustomerId || null,
      campaigns: [],
    };
  }

  const developerToken = normalizeSecret(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const staticAccessToken = normalizeSecret(process.env.GOOGLE_ADS_ACCESS_TOKEN);
  const oauthConfig = getGoogleOauthRefreshConfig();
  const customerId = configuredCustomerId;
  const loginCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

  if (!developerToken || !customerId) {
    return {
      provider: GOOGLE_PLATFORM,
      status: "skipped",
      reason:
        "Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID",
      accountId: customerId || null,
      campaigns: [],
    };
  }

  if (hasAnyRefreshConfig(oauthConfig) && !hasCompleteRefreshConfig(oauthConfig)) {
    return {
      provider: GOOGLE_PLATFORM,
      status: "skipped",
      reason:
        "Incomplete refresh config. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET and GOOGLE_ADS_REFRESH_TOKEN together.",
      accountId: customerId || null,
      campaigns: [],
    };
  }

  const accessToken = hasCompleteRefreshConfig(oauthConfig)
    ? await fetchAccessTokenFromRefreshToken(oauthConfig)
    : staticAccessToken;

  if (!accessToken) {
    return {
      provider: GOOGLE_PLATFORM,
      status: "skipped",
      reason:
        "Missing Google OAuth credential. Set GOOGLE_ADS_ACCESS_TOKEN or provide GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET + GOOGLE_ADS_REFRESH_TOKEN.",
      accountId: customerId || null,
      campaigns: [],
    };
  }

  validateAccessTokenFormat(accessToken);

  const version = normalizeSecret(process.env.GOOGLE_ADS_API_VERSION) || "v22";
  const endpoint = `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`;

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date = '${dateOnly}'
  `;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": developerToken,
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google Ads request failed (${response.status}): ${errorBody.slice(0, 300)}`,
    );
  }

  const payload = await response.json();
  const chunks = Array.isArray(payload) ? payload : [payload];
  const campaigns = [];

  for (const chunk of chunks) {
    for (const row of chunk.results || []) {
      const campaignId = String(row.campaign?.id || "GOOGLE_UNKNOWN");
      const campaignName = row.campaign?.name || `Google Campaign ${campaignId}`;
      const impressions = toInteger(row.metrics?.impressions);
      const clicks = toInteger(row.metrics?.clicks);
      const spend = toNumber(row.metrics?.costMicros) / 1_000_000;
      const leads = Math.round(toNumber(row.metrics?.conversions));

      campaigns.push({
        platform: GOOGLE_PLATFORM,
        accountId: customerId,
        campaignId,
        campaignName,
        impressions,
        clicks,
        leads,
        qualifiedLeads: 0,
        spend,
        rawPayload: row,
      });
    }
  }

  return {
    provider: GOOGLE_PLATFORM,
    status: "success",
    accountId: customerId,
    campaigns,
  };
}

export async function probeGoogleAdsAuthentication() {
  const enabled = toBoolean(process.env.GOOGLE_ADS_ENABLED, false);
  const developerToken = normalizeSecret(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const staticAccessToken = normalizeSecret(process.env.GOOGLE_ADS_ACCESS_TOKEN);
  const oauthConfig = getGoogleOauthRefreshConfig();
  const customerId = normalizeCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const loginCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const apiVersion = normalizeSecret(process.env.GOOGLE_ADS_API_VERSION) || "v22";
  const refreshMode = hasCompleteRefreshConfig(oauthConfig);
  const hasPartialRefreshConfig = hasAnyRefreshConfig(oauthConfig) && !refreshMode;

  const diagnostics = {
    checkedAt: new Date().toISOString(),
    enabled,
    mode: refreshMode ? "refresh_token" : staticAccessToken ? "static_access_token" : "none",
    apiVersion,
    config: {
      developerTokenPresent: Boolean(developerToken),
      customerId: customerId || null,
      loginCustomerId: loginCustomerId || null,
      staticAccessTokenPresent: Boolean(staticAccessToken),
      clientIdPresent: Boolean(oauthConfig.clientId),
      clientSecretPresent: Boolean(oauthConfig.clientSecret),
      refreshTokenPresent: Boolean(oauthConfig.refreshToken),
    },
    checks: {},
  };

  if (!enabled) {
    diagnostics.checks.preflight = {
      ok: false,
      reason: "GOOGLE_ADS_ENABLED is false",
    };
    return diagnostics;
  }

  if (!developerToken) {
    diagnostics.checks.preflight = {
      ok: false,
      reason: "Missing GOOGLE_ADS_DEVELOPER_TOKEN",
    };
    return diagnostics;
  }

  if (hasPartialRefreshConfig) {
    diagnostics.checks.preflight = {
      ok: false,
      reason:
        "Incomplete refresh config. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET and GOOGLE_ADS_REFRESH_TOKEN together.",
    };
    return diagnostics;
  }

  let accessToken = "";
  if (refreshMode) {
    try {
      accessToken = await fetchAccessTokenFromRefreshToken(oauthConfig);
      diagnostics.checks.refresh = {
        ok: true,
        tokenLength: accessToken.length,
      };
    } catch (error) {
      diagnostics.checks.refresh = {
        ok: false,
        error: buildProbeError(error),
      };
      return diagnostics;
    }
  } else if (staticAccessToken) {
    accessToken = staticAccessToken;
    diagnostics.checks.staticToken = {
      ok: true,
      tokenLength: accessToken.length,
    };
  } else {
    diagnostics.checks.preflight = {
      ok: false,
      reason:
        "Missing OAuth credential. Set GOOGLE_ADS_ACCESS_TOKEN or GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET + GOOGLE_ADS_REFRESH_TOKEN.",
    };
    return diagnostics;
  }

  try {
    validateAccessTokenFormat(accessToken);
    diagnostics.checks.tokenFormat = { ok: true };
  } catch (error) {
    diagnostics.checks.tokenFormat = {
      ok: false,
      error: buildProbeError(error),
    };
    return diagnostics;
  }

  try {
    diagnostics.checks.tokenInfo = await inspectAccessToken(accessToken);
  } catch (error) {
    diagnostics.checks.tokenInfo = {
      ok: false,
      error: buildProbeError(error),
    };
  }

  try {
    diagnostics.checks.accessibleCustomers = await fetchAccessibleCustomers({
      accessToken,
      developerToken,
      loginCustomerId,
      version: apiVersion,
    });
  } catch (error) {
    diagnostics.checks.accessibleCustomers = {
      ok: false,
      error: buildProbeError(error),
    };
  }

  try {
    diagnostics.checks.accessibleCustomersWithoutLoginHeader = await fetchAccessibleCustomers({
      accessToken,
      developerToken,
      loginCustomerId: "",
      version: apiVersion,
    });
  } catch (error) {
    diagnostics.checks.accessibleCustomersWithoutLoginHeader = {
      ok: false,
      error: buildProbeError(error),
    };
  }

  const listedCustomers = diagnostics.checks.accessibleCustomers?.customerIds || [];
  diagnostics.checks.customerMatch = {
    configuredCustomerId: customerId || null,
    configuredLoginCustomerId: loginCustomerId || null,
    configuredCustomerListed: customerId ? listedCustomers.includes(customerId) : null,
    loginCustomerListed: loginCustomerId ? listedCustomers.includes(loginCustomerId) : null,
  };

  return diagnostics;
}

export function getGoogleAdsAuthRuntimeDebug() {
  const oauthConfig = getGoogleOauthRefreshConfig();
  const staticAccessToken = normalizeSecret(process.env.GOOGLE_ADS_ACCESS_TOKEN);
  const customerId = normalizeCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const loginCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const apiVersion = normalizeSecret(process.env.GOOGLE_ADS_API_VERSION) || "v22";

  return {
    mode: hasCompleteRefreshConfig(oauthConfig)
      ? "refresh_token"
      : staticAccessToken
        ? "static_access_token"
        : "none",
    staticAccessTokenPresent: Boolean(staticAccessToken),
    staticAccessTokenPrefix: staticAccessToken ? staticAccessToken.slice(0, 4) : null,
    clientIdPresent: Boolean(oauthConfig.clientId),
    clientSecretPresent: Boolean(oauthConfig.clientSecret),
    refreshTokenPresent: Boolean(oauthConfig.refreshToken),
    refreshTokenPrefix: oauthConfig.refreshToken ? oauthConfig.refreshToken.slice(0, 3) : null,
    customerId: customerId || null,
    loginCustomerId: loginCustomerId || null,
    apiVersion,
  };
}
