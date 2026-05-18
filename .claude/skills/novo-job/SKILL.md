---
name: novo-job
description: Scaffold de novo agente de IA para o projeto Amanda. Segue o padrão collect→Claude analysis→store DB→notify, com rastreio via jobExecution. Argumentos: $1 = nome em camelCase (ex: hashtagAnalysis), $2 = descrição (ex: "analisa performance de hashtags").
argument-hint: [nome] [descrição]
---

# Scaffold — Novo Job de IA (Amanda)

Crie o arquivo `backend/src/jobs/$1Job.js` com o seguinte scaffold, adaptando a análise para "$2":

## Arquivo: backend/src/jobs/$1Job.js

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

async function analyze$1(client, item) {
  const prompt = `Você é especialista em marketing digital para advogados.
Analise o seguinte item e retorne SOMENTE JSON válido:

[descrever os dados do item aqui]

Retorne: {"resultado":"<valor>","score":<1-10>,"reasoning":"<máx 120 chars em português>","suggestion":"<ação concreta, máx 160 chars>"}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Resposta inválida do Claude");

  const result = JSON.parse(match[0]);
  result.score = Math.max(1, Math.min(10, Number(result.score) || 5));
  return result;
}

export async function run$1Job({ triggeredBy = "manual" } = {}) {
  const client = getClient();
  if (!client) return { ok: false, reason: "ANTHROPIC_API_KEY não configurada" };

  // ── Registrar execução ────────────────────────────────────────────────────
  const job = await prisma.jobExecution.create({
    data: {
      jobName: "$1",
      status: "RUNNING",
      attempt: 1,
      startedAt: new Date(),
      details: { trigger: triggeredBy },
    },
  });

  // ── Coletar itens a processar ─────────────────────────────────────────────
  const items = await prisma.MODELO.findMany({
    where: { /* filtros — ex: sem análise prévia */ },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (items.length === 0) {
    await prisma.jobExecution.update({
      where: { id: job.id },
      data: { status: "SUCCESS", finishedAt: new Date(), details: { trigger: triggeredBy, processed: 0 } },
    });
    return { ok: true, processed: 0 };
  }

  let processed = 0;
  let errors = 0;

  // ── Processar cada item ───────────────────────────────────────────────────
  for (const item of items) {
    try {
      const result = await analyze$1(client, item);

      await prisma.MODELO_RESULTADO.upsert({
        where: { itemId: item.id },
        create: { itemId: item.id, ...result, analyzedAt: new Date() },
        update: { ...result, analyzedAt: new Date() },
      });

      processed++;
    } catch (e) {
      console.error(`[$1Job] Erro no item ${item.id}:`, e.message);
      errors++;
    }
  }

  // ── Finalizar execução ────────────────────────────────────────────────────
  await prisma.jobExecution.update({
    where: { id: job.id },
    data: {
      status: errors > 0 && processed === 0 ? "FAILED" : "SUCCESS",
      finishedAt: new Date(),
      details: { trigger: triggeredBy, processed, errors },
    },
  });

  return { ok: true, processed, errors };
}
```

## Registrar endpoint no server.js

Adicionar import e rota POST junto aos demais jobs em `backend/src/server.js`:

```javascript
// Import
import { run$1Job } from "./jobs/$1Job.js";

// Endpoint
app.post("/jobs/$1/run", requireAuth, async (req, res) => {
  try {
    const result = await run$1Job({ triggeredBy: "http" });
    res.json(result);
  } catch (e) {
    console.error("[$1Job]", e.message);
    res.status(500).json({ ok: false, reason: e.message });
  }
});
```

## Registrar no scheduler (se for periódico)

Se o job deve rodar automaticamente, adicionar no scheduler correspondente ou criar `backend/src/jobs/$1Scheduler.js` seguindo o padrão de `instagramScheduler.js`.

## Checklist

- [ ] Substituir `MODELO` e `MODELO_RESULTADO` pelos modelos Prisma corretos
- [ ] Verificar se os modelos existem em `backend/prisma/schema.prisma` — criar migration se necessário (`/nova-migration`)
- [ ] Implementar o prompt de análise em `analyze$1()` com critérios de negócio claros
- [ ] Registrar endpoint no `server.js`
- [ ] Decidir se precisa de scheduler periódico ou apenas disparo manual
- [ ] Commit + push
