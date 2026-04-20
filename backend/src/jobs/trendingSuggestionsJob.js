import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

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

async function fetchTitles(feed) {
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "AMR-Ads-Bot/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // Extrai <title> de cada <item>
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

  // Busca todos os feeds em paralelo
  const results = await Promise.all(FEEDS.map(async (f) => {
    const titles = await fetchTitles(f);
    return { source: f.name, titles };
  }));

  const allTitles = results.flatMap((r) =>
    r.titles.map((t) => `[${r.source}] ${t}`)
  );

  if (allTitles.length === 0) return { ok: false, reason: "Nenhum feed retornou dados" };

  const prompt = `Você é estrategista de conteúdo para @amandamramalho, advogada com foco em Direito Empresarial, Trabalhista e do Consumidor.

Abaixo estão manchetes recentes dos principais portais jurídicos brasileiros:

${allTitles.join("\n")}

Com base nestas manchetes, identifique os 6 temas mais relevantes para o perfil da Amanda e sugira posts de alto impacto no Instagram.

Para cada sugestão:
- Escolha o formato ideal: REEL (tendência/alcance), CAROUSEL (educativo/salvo), POST (frase impacto), STORIES (interação rápida)
- O tema deve ser traduzido para a linguagem do público: empreendedores, trabalhadores e consumidores — não juridiquês
- Priorize temas que geram dúvidas comuns ou urgência

Retorne SOMENTE um array JSON válido:
[
  {"theme":"<título direto e envolvente para o post>","format":"POST"|"CAROUSEL"|"STORIES"|"REEL","reasoning":"<por que este tema está em alta e qual dúvida responde, máx 120 chars>"},
  ...
]`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
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
      reasoning: s.reasoning || "",
      status: "PENDING",
    })),
  });

  const sources = results.filter((r) => r.titles.length > 0).map((r) => r.source);
  await prisma.jobExecution.update({ where: { id: job.id }, data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, created: valid.length, sources } } });
  console.log(`[trending-suggestions] ${triggeredBy}: ${valid.length} sugestões de ${sources.join(", ")}`);
  return { ok: true, created: valid.length, sources };
}
