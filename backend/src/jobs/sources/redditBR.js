// Reddit BR — captura dúvidas e relatos reais de pessoas comuns.
// Sinal complementar a Conjur/JOTA/Migalhas: enquanto esses mostram o que a imprensa jurídica fala,
// o Reddit mostra o que o cliente potencial de fato pergunta — linguagem viva e dor real.

const SUBREDDITS = ["conselhojuridico", "direito"];
const POSTS_PER_SUB = 10;
const MIN_SCORE = 3;

async function fetchSubreddit(sub) {
  try {
    const url = `https://www.reddit.com/r/${sub}/top.json?t=week&limit=${POSTS_PER_SUB}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "AMR-Ads-Bot/1.0 (by u/amandamramalho)" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const children = data?.data?.children || [];
    return children
      .filter((c) => {
        const d = c.data || {};
        return !d.stickied && !d.over_18 && (d.score || 0) >= MIN_SCORE;
      })
      .map((c) => c.data?.title)
      .filter(Boolean)
      .map((t) => `[r/${sub}] ${t}`)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export async function fetchRedditBR() {
  const results = await Promise.allSettled(SUBREDDITS.map(fetchSubreddit));
  return results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);
}
