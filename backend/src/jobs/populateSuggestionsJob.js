import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

const ACTION_CONTEXT = {
  INVEST: "Este post tem alto engajamento e deve ser impulsionado com anúncios.",
  REDIRECT: "Este post tem potencial mas engajamento baixo — a abordagem precisa mudar.",
  REMOVE: "Este post tem performance ruim e prejudica o perfil.",
  MONITOR: "Este post é recente ou tem dados insuficientes para julgamento.",
  MAINTAIN: "Este post tem performance média e não precisa de ação urgente.",
};

async function generateSuggestion(client, post, analysis) {
  const prompt = `Você é especialista em marketing digital para advogados. Dê UMA sugestão concreta e específica para este post do Instagram de @amandamramalho.

Ação classificada: ${analysis.action} — ${ACTION_CONTEXT[analysis.action] || ""}
Tipo: ${post.mediaType} | Publicado: ${post.publishedAt?.toISOString().slice(0, 10)}
Legenda: ${post.caption ? `"${post.caption.slice(0, 300)}"` : "(sem legenda)"}
Curtidas: ${post.likeCount} | Comentários: ${post.commentsCount}${post.reach != null ? ` | Alcance: ${post.reach}` : ""}

Retorne SOMENTE JSON: {"suggestion":"<instrução direta e acionável para este post, máx 160 chars em português>"}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Resposta inválida");
  return JSON.parse(match[0]).suggestion || null;
}

export async function runPopulateSuggestionsJob() {
  const client = getClient();
  if (!client) return { ok: false, reason: "ANTHROPIC_API_KEY não configurada" };

  const analyses = await prisma.postAnalysis.findMany({
    where: { suggestion: null },
    include: { post: true },
  });

  if (analyses.length === 0) return { ok: true, updated: 0 };

  let updated = 0;
  let errors = 0;

  for (const analysis of analyses) {
    try {
      const suggestion = await generateSuggestion(client, analysis.post, analysis);
      await prisma.postAnalysis.update({
        where: { id: analysis.id },
        data: { suggestion },
      });
      updated++;
    } catch (e) {
      console.error(`Erro ao gerar sugestão para ${analysis.postId}:`, e.message);
      errors++;
    }
  }

  return { ok: true, updated, errors };
}
