const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

const QUERIES = [
  "direito advocacia",
  "STF decisão",
  "OAB advogado",
  "LGPD proteção dados",
  "direito trabalhista",
  "direito do consumidor",
  "contrato empresarial",
];

async function searchQuery(apiKey, q) {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const params = new URLSearchParams({
    part: "snippet",
    q,
    type: "video",
    regionCode: "BR",
    relevanceLanguage: "pt",
    order: "viewCount",
    publishedAfter: since.toISOString(),
    maxResults: "5",
    key: apiKey,
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.items || []).map((item) => item.snippet?.title).filter(Boolean);
}

export async function fetchYoutubeTrending() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("[youtubeTrending] YOUTUBE_API_KEY não configurada — fonte ignorada.");
    return [];
  }

  // Busca as 3 primeiras queries em paralelo para economizar quota
  const results = await Promise.allSettled(
    QUERIES.slice(0, 3).map((q) => searchQuery(apiKey, q))
  );

  const titles = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // Dedup por similaridade de início de string
  const seen = new Set();
  return titles.filter((t) => {
    const key = t.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
