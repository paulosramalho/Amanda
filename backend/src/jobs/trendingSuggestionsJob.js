import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { fetchYoutubeTrending } from "./sources/youtubeTrending.js";
import { fetchGoogleTrendsBR } from "./sources/googleTrendsBR.js";
import { fetchRedditBR } from "./sources/redditBR.js";
import { fetchInstituicoesBR } from "./sources/instituicoesBR.js";

const FEEDS = [
  { name: "Conjur",    url: "https://www.conjur.com.br/rss.xml" },
  { name: "JOTA",      url: "https://www.jota.info/feed" },
  { name: "Migalhas",  url: "https://www.migalhas.com.br/rss/quentes" },
];

const FORMATS = ["POST", "CAROUSEL", "STORIES", "REEL"];

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

async function fetchRssTitles(feed) {
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "AMR-Ads-Bot/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)];
    return items.map((m) => {
      const t = m[0].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      return t ? t[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null;
    }).filter(Boolean).slice(0, 15);
  } catch {
    return [];
  }
}

export async function runTrendingSuggestionsJob({ triggeredBy = "manual" } = {}) {
  const client = getClient();
  if (!client) return { ok: false, reason: "ANTHROPIC_API_KEY não configurada" };

  const job = await prisma.jobExecution.create({
    data: { jobName: "trending_suggestions", status: "RUNNING", attempt: 1, startedAt: new Date(), details: { trigger: triggeredBy } },
  });

  // Busca todas as fontes em paralelo
  const [rssResults, youtubeTitles, googleTitles, redditTitles, instTitles] = await Promise.all([
    Promise.all(FEEDS.map(async (f) => ({ source: f.name, titles: await fetchRssTitles(f) }))),
    fetchYoutubeTrending().catch(() => []),
    fetchGoogleTrendsBR().catch(() => []),
    fetchRedditBR().catch(() => []),
    fetchInstituicoesBR().catch(() => []),
  ]);

  // Monta lista unificada com prefixo de fonte
  const allTitles = [
    ...rssResults.flatMap((r) => r.titles.map((t) => `[${r.source}] ${t}`)),
    ...youtubeTitles.map((t) => `[YouTube] ${t}`),
    ...googleTitles.map((t) => `[Google Trends BR] ${t}`),
    ...redditTitles.map((t) => `[Reddit BR] ${t}`),
    ...instTitles.map((t) => `[Instituições BR] ${t}`),
  ];

  if (allTitles.length === 0) {
    await prisma.jobExecution.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), details: { trigger: triggeredBy, reason: "Nenhuma fonte retornou dados" } } });
    return { ok: false, reason: "Nenhuma fonte retornou dados" };
  }

  const sources = [
    ...rssResults.filter((r) => r.titles.length > 0).map((r) => r.source),
    ...(youtubeTitles.length > 0 ? ["YouTube"] : []),
    ...(googleTitles.length > 0 ? ["Google Trends BR"] : []),
    ...(redditTitles.length > 0 ? ["Reddit BR"] : []),
    ...(instTitles.length > 0 ? ["Instituições BR"] : []),
  ];

  const prompt = `Você é estrategista de conteúdo para @amandamramalho, advogada com foco em Direito Empresarial, Trabalhista e do Consumidor.

Abaixo estão sinais de tendência coletados de múltiplas fontes neste momento:
- Portais jurídicos (Conjur, JOTA, Migalhas): manchetes editoriais
- YouTube Brasil: títulos de vídeos jurídicos mais assistidos nos últimos 7 dias
- Google Trends BR: termos em alta nas buscas do Brasil hoje
- Reddit BR (r/conselhojuridico, r/direito): dúvidas e relatos reais de pessoas comuns — sinaliza linguagem viva e dor real do cliente potencial
- Instituições BR (STJ + Câmara + Senado): pipeline decisório em Brasília — mostra o que está sendo julgado/votado AGORA e vai virar pauta nos próximos dias

${allTitles.join("\n")}

Com base nestes sinais, identifique os 7 temas mais relevantes para o perfil da Amanda e sugira posts de alto impacto no Instagram.

Para cada sugestão:
- Escolha o formato ideal: REEL (tendência/alcance), CAROUSEL (educativo/salvo), POST (frase impacto), STORIES (interação rápida)
- O tema deve ser traduzido para a linguagem do público: empreendedores, trabalhadores e consumidores — não juridiquês
- Prefira temas que estão em MÚLTIPLAS fontes simultaneamente (sinal mais forte de tendência real)
- Priorize temas que geram dúvidas comuns, urgência ou reação emocional

Retorne SOMENTE um array JSON válido:
[
  {"theme":"<título direto e envolvente para o post>","format":"POST"|"CAROUSEL"|"STORIES"|"REEL","reasoning":"<por que está em alta e qual dúvida responde, máx 120 chars>","sources":"<ex: Conjur, YouTube>"},
  ...
]`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Resposta inválida do Claude");

  const suggestions = JSON.parse(match[0]);
  if (!Array.isArray(suggestions)) throw new Error("JSON não é um array");

  const valid = suggestions.filter((s) => s.theme && FORMATS.includes(s.format));

  await prisma.contentSuggestion.createMany({
    data: valid.map((s) => ({
      theme: s.theme,
      format: s.format,
      reasoning: s.reasoning ? `${s.reasoning}${s.sources ? ` [${s.sources}]` : ""}` : "",
      status: "PENDING",
    })),
  });

  await prisma.jobExecution.update({
    where: { id: job.id },
    data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, created: valid.length, sources } },
  });

  console.log(`[trending-suggestions] ${triggeredBy}: ${valid.length} sugestões de ${sources.join(", ")}`);
  return { ok: true, created: valid.length, sources };
}
