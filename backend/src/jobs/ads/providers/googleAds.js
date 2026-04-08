const GOOGLE_PLATFORM = "GOOGLE_ADS";

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

export async function collectGoogleAdsCampaignMetrics({ dateOnly }) {
  const enabled = toBoolean(process.env.GOOGLE_ADS_ENABLED, false);

  if (!enabled) {
    return {
      provider: GOOGLE_PLATFORM,
      status: "skipped",
      reason: "GOOGLE_ADS_ENABLED is false",
      accountId: process.env.GOOGLE_ADS_CUSTOMER_ID || null,
      campaigns: [],
    };
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const accessToken = process.env.GOOGLE_ADS_ACCESS_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

  if (!developerToken || !accessToken || !customerId) {
    return {
      provider: GOOGLE_PLATFORM,
      status: "skipped",
      reason:
        "Missing GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_ACCESS_TOKEN or GOOGLE_ADS_CUSTOMER_ID",
      accountId: customerId || null,
      campaigns: [],
    };
  }

  const version = process.env.GOOGLE_ADS_API_VERSION || "v18";
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

  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
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
