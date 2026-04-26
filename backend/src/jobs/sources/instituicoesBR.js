// Instituições BR — pipeline decisório de Brasília (STJ + Câmara + Senado).
// Complementa googleTrendsBR.js (que cobre "STF decisão") trazendo o que está sendo
// julgado/votado AGORA — antecipa pautas que vão impactar empresas e cidadãos.

const QUERIES = [
  "STJ julgamento",            // uniformização jurisprudencial — vincula tribunais inferiores
  "Câmara aprova projeto",     // PLs avançando — mudança legislativa em curso
  "Senado aprova projeto",     // sanção/veto — viram lei em breve
];

async function fetchNewsRss(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "AMR-Ads-Bot/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)];
    return items.map((m) => {
      const t = m[0].match(/<title>([\s\S]*?)<\/title>/i);
      return t ? t[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : null;
    }).filter(Boolean).slice(0, 5);
  } catch {
    return [];
  }
}

export async function fetchInstituicoesBR() {
  const results = await Promise.allSettled(QUERIES.map(fetchNewsRss));
  return results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);
}
