const META_PLATFORM = "META_ADS";
const LEAD_ACTION_TYPES = new Set([
  "lead",
  "omni_lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
]);

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

function extractLeadCount(actions = []) {
  return actions.reduce((sum, action) => {
    if (!action || !LEAD_ACTION_TYPES.has(action.action_type)) {
      return sum;
    }

    return sum + toNumber(action.value);
  }, 0);
}

async function fetchAllPages(url) {
  const rows = [];
  let nextUrl = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, { method: "GET" });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Meta Ads request failed (${response.status}): ${errorBody.slice(0, 300)}`);
    }

    const payload = await response.json();
    rows.push(...(payload.data || []));
    nextUrl = payload.paging?.next || null;
  }

  return rows;
}

export async function collectMetaAdsCampaignMetrics({ dateOnly }) {
  const enabled = toBoolean(process.env.META_ADS_ENABLED, false);

  if (!enabled) {
    return {
      provider: META_PLATFORM,
      status: "skipped",
      reason: "META_ADS_ENABLED is false",
      accountId: process.env.META_ADS_ACCOUNT_ID || null,
      campaigns: [],
    };
  }

  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  const accountId = process.env.META_ADS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    return {
      provider: META_PLATFORM,
      status: "skipped",
      reason: "Missing META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID",
      accountId: accountId || null,
      campaigns: [],
    };
  }

  const version = process.env.META_ADS_API_VERSION || "v22.0";
  const endpoint = `https://graph.facebook.com/${version}/act_${accountId}/insights`;
  const params = new URLSearchParams({
    access_token: accessToken,
    level: "campaign",
    fields: "campaign_id,campaign_name,impressions,clicks,spend,actions",
    time_range: JSON.stringify({ since: dateOnly, until: dateOnly }),
    limit: "500",
  });

  const rows = await fetchAllPages(`${endpoint}?${params.toString()}`);

  const campaigns = rows.map((row) => {
    const campaignId = String(row.campaign_id || "META_UNKNOWN");
    const campaignName = row.campaign_name || `Meta Campaign ${campaignId}`;
    const impressions = toInteger(row.impressions);
    const clicks = toInteger(row.clicks);
    const spend = toNumber(row.spend);
    const leads = Math.round(extractLeadCount(row.actions));

    return {
      platform: META_PLATFORM,
      accountId,
      campaignId,
      campaignName,
      impressions,
      clicks,
      leads,
      qualifiedLeads: 0,
      spend,
      rawPayload: row,
    };
  });

  return {
    provider: META_PLATFORM,
    status: "success",
    accountId,
    campaigns,
  };
}
