import googleTrends from "google-trends-api";

// Termos cujas buscas em alta no Brasil queremos capturar
const RISING_KEYWORDS = ["advogado", "STF", "LGPD", "direito trabalhista", "direito do consumidor"];

// Queries para Google News RSS — manchetes jurídicas em português
const NEWS_QUERIES = [
  "STF decisão",
  "OAB advogado",
  "direito trabalhista",
  "LGPD consumidor",
  "contrato empresarial",
];

async function fetchRisingSearches(keyword) {
  try {
    const raw = await googleTrends.relatedQueries({ keyword, geo: "BR" });
    const d = JSON.parse(raw);
    // rankedList[1] = "rising" (buscas em alta), rankedList[0] = "top"
    return (d?.default?.rankedList?.[1]?.rankedKeyword || [])
      .slice(0, 4)
      .map((r) => r.query)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchNewsRss(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AMR-Bot/1.0)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    // Pula o primeiro <title> que é o nome do feed
    const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)];
    return items.map((m) => {
      const t = m[0].match(/<title>([\s\S]*?)<\/title>/i);
      return t ? t[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : null;
    }).filter(Boolean).slice(0, 5);
  } catch {
    return [];
  }
}

export async function fetchGoogleTrendsBR() {
  const [risingResults, newsResults] = await Promise.all([
    // Buscas em alta para termos jurídicos
    Promise.allSettled(RISING_KEYWORDS.slice(0, 3).map(fetchRisingSearches)),
    // Manchetes do Google News para queries específicas
    Promise.allSettled(NEWS_QUERIES.slice(0, 3).map(fetchNewsRss)),
  ]);

  const risingTerms = risingResults
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .map((q) => `Em alta nas buscas: "${q}"`);

  const newsHeadlines = newsResults
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  return [...risingTerms, ...newsHeadlines];
}
