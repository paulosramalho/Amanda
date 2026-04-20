import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

const FORMATS = ["POST", "CAROUSEL", "STORIES", "REEL"];

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

export async function runContentSuggestionsJob({ triggeredBy = "manual" } = {}) {
  const client = getClient();
  if (!client) return { ok: false, reason: "ANTHROPIC_API_KEY não configurada" };

  // Lê últimos 30 posts com análise para contexto
  const posts = await prisma.instagramPost.findMany({
    orderBy: { publishedAt: "desc" },
    take: 30,
    include: { analysis: true },
  });

  if (posts.length === 0) return { ok: false, reason: "Nenhum post coletado ainda" };

  // Resume os posts para o prompt
  const postsSummary = posts.map((p) => {
    const cap = p.caption ? p.caption.slice(0, 120) : "(sem legenda)";
    const action = p.analysis?.action ?? "SEM_ANÁLISE";
    const score = p.analysis?.score ?? "—";
    return `- [${p.mediaType}] "${cap}" | Curtidas: ${p.likeCount} | Ação: ${action} | Score: ${score}`;
  }).join("\n");

  const prompt = `Você é estrategista de conteúdo para @amandamramalho, advogada especialista em Direito Empresarial, Trabalhista e do Consumidor. Analise os posts recentes e sugira novos conteúdos.

POSTS RECENTES (últimos ${posts.length}):
${postsSummary}

Com base nos temas já abordados, nos gaps de conteúdo e nas tendências do Instagram jurídico, sugira 7 novos conteúdos.

Para cada sugestão considere:
- Temas não cobertos ou pouco explorados no perfil
- Formatos que performam bem para conteúdo jurídico (CAROUSEL=educativo, REEL=tendência/alcance, POST=imagem única com frase de impacto, STORIES=bastidores/interação)
- Sazonalidade, datas comemorativas ou pautas jurídicas em alta
- Equilíbrio entre formatos

Retorne SOMENTE um array JSON válido:
[
  {"theme":"<título do conteúdo, direto e específico>","format":"POST"|"CAROUSEL"|"STORIES"|"REEL","reasoning":"<por que este tema/formato agora, máx 120 chars>"},
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

  console.log(`[content-suggestions] ${triggeredBy}: ${valid.length} sugestões criadas`);
  return { ok: true, created: valid.length };
}
