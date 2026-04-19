import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

const ACTIONS = ["INVEST", "REDIRECT", "REMOVE", "MONITOR", "MAINTAIN"];

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

async function analyzePost(client, post) {
  const engagementRate = post.reach && post.reach > 0
    ? (((post.likeCount + post.commentsCount + (post.saved || 0)) / post.reach) * 100).toFixed(2)
    : null;

  const ageInDays = Math.floor((Date.now() - new Date(post.publishedAt).getTime()) / 86400000);

  const prompt = `Você é especialista em marketing digital para advogados. Avalie esta postagem do Instagram de @amandamramalho.

Tipo: ${post.mediaType} | Publicada: ${ageInDays} dias atrás
Legenda: ${post.caption ? `"${post.caption.slice(0, 400)}"` : "(sem legenda)"}
Curtidas: ${post.likeCount} | Comentários: ${post.commentsCount} | Alcance: ${post.reach ?? "N/D"} | Impressões: ${post.impressions ?? "N/D"} | Salvamentos: ${post.saved ?? "N/D"} | Compartilhamentos: ${post.shares ?? "N/D"}${post.plays != null ? ` | Visualizações: ${post.plays}` : ""}${engagementRate ? ` | Engajamento: ${engagementRate}%` : ""}

Retorne SOMENTE JSON válido:
{"action":"INVEST"|"REDIRECT"|"REMOVE"|"MONITOR"|"MAINTAIN","score":<1-10>,"reasoning":"<máx 120 chars em português>"}

INVEST=alto engajamento, impulsionar com ads. REDIRECT=alcance ok mas engajamento baixo, mudar abordagem. REMOVE=performance ruim, prejudica perfil. MONITOR=post recente (<5 dias) ou dados insuficientes. MAINTAIN=performance média, nada urgente.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Resposta inválida do Claude");

  const result = JSON.parse(match[0]);
  if (!ACTIONS.includes(result.action)) result.action = "MONITOR";
  result.score = Math.max(1, Math.min(10, Number(result.score) || 5));
  return result;
}

export async function runPostAnalysisJob({ triggeredBy = "manual", forceReanalyze = false } = {}) {
  const client = getClient();
  if (!client) return { ok: false, reason: "ANTHROPIC_API_KEY não configurada" };

  const posts = await prisma.instagramPost.findMany({
    where: forceReanalyze ? {} : { analysis: null },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  if (posts.length === 0) return { ok: true, analyzed: 0 };

  let analyzed = 0;
  let errors = 0;

  for (const post of posts) {
    try {
      const result = await analyzePost(client, post);
      await prisma.postAnalysis.upsert({
        where: { postId: post.id },
        create: { postId: post.id, action: result.action, score: result.score, reasoning: result.reasoning, analyzedAt: new Date() },
        update: { action: result.action, score: result.score, reasoning: result.reasoning, analyzedAt: new Date() },
      });
      analyzed++;
    } catch (e) {
      console.error(`Erro ao analisar post ${post.igPostId}:`, e.message);
      errors++;
    }
  }

  return { ok: true, analyzed, errors };
}
