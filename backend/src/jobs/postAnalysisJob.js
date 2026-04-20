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

  const hasReachData = post.reach != null || post.impressions != null;

  const prompt = `Você é especialista em marketing digital para advogados. Avalie esta postagem do Instagram de @amandamramalho (conta jurídica, ~5k seguidores).

Tipo: ${post.mediaType} | Publicada: ${ageInDays} dias atrás
Legenda: ${post.caption ? `"${post.caption.slice(0, 400)}"` : "(sem legenda)"}
Curtidas: ${post.likeCount} | Comentários: ${post.commentsCount}${post.reach != null ? ` | Alcance: ${post.reach}` : ""}${post.impressions != null ? ` | Impressões: ${post.impressions}` : ""}${post.saved != null ? ` | Salvamentos: ${post.saved}` : ""}${post.plays != null ? ` | Visualizações: ${post.plays}` : ""}${engagementRate ? ` | Engajamento: ${engagementRate}%` : ""}

Critérios de ação (use estes, não invente outros):
- INVEST: curtidas altas para o nicho (>80) OU engajamento >3% — vale impulsionar com ads
- MAINTAIN: performance média, nada urgente — post ok, não precisa de ação imediata
- REDIRECT: publicado há >14 dias com curtidas <20 E conteúdo tem potencial mas execução fraca
- REMOVE: post sem legenda, legenda irrelevante, ou curtidas <5 após >30 dias — prejudica perfil
- MONITOR: post com <5 dias OU sem dados suficientes para julgar${!hasReachData ? "\nATENÇÃO: alcance/impressões indisponíveis — use MONITOR se curtidas estiverem na média do perfil, MAINTAIN se o conteúdo for sólido." : ""}

Retorne SOMENTE JSON válido:
{"action":"INVEST"|"REDIRECT"|"REMOVE"|"MONITOR"|"MAINTAIN","score":<1-10>,"reasoning":"<máx 120 chars em português>","suggestion":"<instrução concreta para este post específico, máx 160 chars>"}`;


  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
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

  const job = await prisma.jobExecution.create({
    data: { jobName: "post_analysis", status: "RUNNING", attempt: 1, startedAt: new Date(), details: { trigger: triggeredBy, forceReanalyze } },
  });

  const posts = await prisma.instagramPost.findMany({
    where: forceReanalyze ? {} : { analysis: null },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  if (posts.length === 0) {
    await prisma.jobExecution.update({ where: { id: job.id }, data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, analyzed: 0 } } });
    return { ok: true, analyzed: 0 };
  }

  let analyzed = 0;
  let errors = 0;

  for (const post of posts) {
    try {
      const result = await analyzePost(client, post);
      await prisma.postAnalysis.upsert({
        where: { postId: post.id },
        create: { postId: post.id, action: result.action, score: result.score, reasoning: result.reasoning, suggestion: result.suggestion || null, analyzedAt: new Date() },
        update: { action: result.action, score: result.score, reasoning: result.reasoning, suggestion: result.suggestion || null, analyzedAt: new Date() },
      });
      analyzed++;
    } catch (e) {
      console.error(`Erro ao analisar post ${post.igPostId}:`, e.message);
      errors++;
    }
  }

  await prisma.jobExecution.update({ where: { id: job.id }, data: { status: errors > 0 && analyzed === 0 ? "FAILED" : "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, analyzed, errors } } });
  return { ok: true, analyzed, errors };
}
