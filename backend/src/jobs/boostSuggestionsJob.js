import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

const MIN_BOOST_BRL = 30;            // piso Meta para boost
const MAX_PER_POST_PCT = 0.25;       // teto: 25% do saldo restante por post
const LOOKBACK_DAYS_POSTS = 14;      // janela de posts elegíveis (antes do orgânico saturar)
const LOOKBACK_DAYS_ADS = 30;        // janela para CPL médio
const MAX_SUGGESTIONS = 4;           // até 4 boosts por execução

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Belem",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}`;
}

export async function runBoostSuggestionsJob({ triggeredBy = "manual" } = {}) {
  const client = getClient();
  if (!client) return { ok: false, reason: "ANTHROPIC_API_KEY não configurada" };

  const job = await prisma.jobExecution.create({
    data: { jobName: "boost_suggestions", status: "RUNNING", attempt: 1, startedAt: new Date(), details: { trigger: triggeredBy } },
  });

  try {
    // 1. Saldo do mês — meta vs gasto até agora
    const month = currentMonth();
    const goal = await prisma.monthlyGoal.findUnique({ where: { month } });
    const monthStart = new Date(`${month}-01T00:00:00Z`);
    const monthAds = await prisma.campaignDaily.findMany({
      where: { businessDate: { gte: monthStart } },
      select: { spend: true },
    });
    const spentMonth = monthAds.reduce((s, r) => s + Number(r.spend || 0), 0);
    const spendGoal = goal?.spendGoal ? Number(goal.spendGoal) : null;
    const remaining = spendGoal ? Math.max(0, spendGoal - spentMonth) : null;

    if (spendGoal && remaining < MIN_BOOST_BRL) {
      await prisma.jobExecution.update({ where: { id: job.id }, data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, created: 0, reason: `Saldo do mês (R$ ${remaining.toFixed(2)}) abaixo do piso de R$ ${MIN_BOOST_BRL}` } } });
      return { ok: true, created: 0, reason: "Saldo insuficiente" };
    }

    // 2. CPL médio — últimos 30 dias, prioriza META (boost = Meta)
    const adsFrom = new Date();
    adsFrom.setUTCDate(adsFrom.getUTCDate() - LOOKBACK_DAYS_ADS);
    const adsRows = await prisma.campaignDaily.findMany({
      where: { businessDate: { gte: adsFrom } },
      select: { spend: true, leads: true, platform: true },
    });
    const meta = adsRows.filter((r) => (r.platform || "").toUpperCase() === "META");
    const ref = meta.length > 0 ? meta : adsRows;
    const totalSpend = ref.reduce((s, r) => s + Number(r.spend || 0), 0);
    const totalLeads = ref.reduce((s, r) => s + (r.leads || 0), 0);
    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : null;

    // 3. Posts elegíveis — últimos 14 dias, com análise
    const postsFrom = new Date();
    postsFrom.setUTCDate(postsFrom.getUTCDate() - LOOKBACK_DAYS_POSTS);
    const posts = await prisma.instagramPost.findMany({
      where: { publishedAt: { gte: postsFrom } },
      orderBy: { publishedAt: "desc" },
      include: { analysis: true },
      take: 30,
    });

    if (posts.length === 0) {
      await prisma.jobExecution.update({ where: { id: job.id }, data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, created: 0, reason: "Nenhum post nos últimos 14 dias" } } });
      return { ok: true, created: 0, reason: "Sem posts recentes" };
    }

    // 4. Engajamento médio do perfil para baseline
    const allPosts = await prisma.instagramPost.findMany({
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: { likeCount: true, commentsCount: true, reach: true },
    });
    const engagementOf = (p) => (p.likeCount || 0) + 2 * (p.commentsCount || 0) + (p.reach || 0) / 100;
    const baseline = allPosts.length > 0 ? allPosts.map(engagementOf).sort((a, b) => a - b)[Math.floor(allPosts.length / 2)] : 0;

    // 5. Filtro: INVEST OR engajamento ≥ 1.5× mediana
    const eligible = posts.filter((p) => {
      const isInvest = p.analysis?.action === "INVEST";
      const aboveMedian = engagementOf(p) >= 1.5 * baseline;
      return isInvest || aboveMedian;
    });

    if (eligible.length === 0) {
      await prisma.jobExecution.update({ where: { id: job.id }, data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, created: 0, reason: "Nenhum post com tração suficiente" } } });
      return { ok: true, created: 0, reason: "Sem posts com tração" };
    }

    const teto = remaining ? Math.floor(remaining * MAX_PER_POST_PCT) : 100;

    const postsSummary = eligible.map((p, i) => {
      const cap = p.caption ? p.caption.slice(0, 100).replace(/\n/g, " ") : "(sem legenda)";
      return `${i + 1}. id=${p.id} | [${p.mediaType}] "${cap}" | curtidas=${p.likeCount} comentários=${p.commentsCount} alcance=${p.reach ?? "—"} | ação=${p.analysis?.action ?? "—"} score=${p.analysis?.score ?? "—"}`;
    }).join("\n");

    const prompt = `Você é estrategista de anúncios para @amandamramalho, advogada (Direito Empresarial, Trabalhista e do Consumidor).

Selecione até ${MAX_SUGGESTIONS} posts orgânicos que valem a pena impulsionar (boost no Instagram via Meta) AGORA.

CONTEXTO FINANCEIRO:
- Mês: ${month}
- Meta de gasto: ${spendGoal ? `R$ ${spendGoal.toFixed(2)}` : "não definida"}
- Já gasto no mês: R$ ${spentMonth.toFixed(2)}
- Saldo restante: ${remaining != null ? `R$ ${remaining.toFixed(2)}` : "(sem meta — sugerir valores entre R$ 30 e R$ 100)"}
- CPL médio últimos 30 dias (Meta): ${avgCpl ? `R$ ${avgCpl.toFixed(2)}` : "(sem dados — assumir R$ 25)"}

POSTS ELEGÍVEIS (últimos ${LOOKBACK_DAYS_POSTS} dias, com tração ou marcados INVEST):
${postsSummary}

REGRAS:
- Valor mínimo por boost: R$ ${MIN_BOOST_BRL}
- Valor máximo por boost: ${remaining ? `R$ ${teto}` : "R$ 100"} (25% do saldo)
- Soma total das sugestões NÃO pode exceder ${remaining ? `R$ ${Math.floor(remaining * 0.6)}` : "R$ 200"} (deixar margem para campanhas)
- Estimar leads como: amount / CPL_médio (mas ajuste para cima se o post tiver engajamento >2× média, pois a audiência semelhante converte melhor)
- Priorize posts com engajamento orgânico forte E ação INVEST — ambos juntos sinalizam ressonância real

Retorne SOMENTE um array JSON válido, ranqueado por prioridade:
[
  {"postId":"<id>","amount":<inteiro em reais>,"estimatedLeads":<float>,"reasoning":"<por que este post agora, máx 140 chars>"},
  ...
]`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].text.trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Resposta inválida do Claude");
    const items = JSON.parse(match[0]);
    if (!Array.isArray(items)) throw new Error("JSON não é um array");

    const eligibleIds = new Set(eligible.map((p) => p.id));
    const valid = items
      .filter((s) => s.postId && eligibleIds.has(s.postId) && Number.isFinite(s.amount) && s.amount >= MIN_BOOST_BRL && s.reasoning)
      .slice(0, MAX_SUGGESTIONS);

    await prisma.boostSuggestion.createMany({
      data: valid.map((s) => ({
        postId: s.postId,
        suggestedAmount: Math.round(s.amount * 100), // armazena em centavos
        estimatedLeads: Number.isFinite(s.estimatedLeads) ? s.estimatedLeads : null,
        estimatedCpl: avgCpl ? avgCpl.toFixed(2) : null,
        reasoning: String(s.reasoning).slice(0, 280),
        status: "PENDING",
      })),
    });

    await prisma.jobExecution.update({
      where: { id: job.id },
      data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, created: valid.length, eligible: eligible.length, remaining, avgCpl } },
    });

    console.log(`[boost-suggestions] ${triggeredBy}: ${valid.length} sugestões (de ${eligible.length} elegíveis, saldo R$ ${remaining ?? "n/d"})`);
    return { ok: true, created: valid.length };
  } catch (error) {
    await prisma.jobExecution.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: error instanceof Error ? error.message : String(error), details: { trigger: triggeredBy } },
    });
    throw error;
  }
}
