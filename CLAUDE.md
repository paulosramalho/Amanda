# Amanda — Dashboard de Marketing com IA

Projeto da Amanda Maia Ramalho (filha do Paulo). Painel de gestão de anúncios, conteúdo e IA para a marca pessoal dela como advogada.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js (ESM), Express, Prisma ORM |
| Banco | PostgreSQL — Neon (serverless) |
| Frontend | React + Vite + Tailwind CSS |
| IA | Anthropic SDK — `claude-haiku-4-5-20251001` (jobs em lote) |
| Deploy | Backend → Render · Frontend → Vercel |

---

## Comandos

```bash
# Backend
cd backend
npm run dev           # node --watch src/server.js (porta 3000)
npm run prisma:migrate:dev   # nova migration
npm run prisma:generate      # regenerar client

# Frontend
cd frontend
npm run dev           # Vite dev server
npm run build         # build de produção
```

---

## Estrutura do backend

```
src/
  server.js              # entry point, todos os endpoints REST
  lib/
    prisma.js            # instância Prisma singleton
    notify.js            # envio de e-mail (Nodemailer)
    adminNotify.js       # alertas Telegram + e-mail para Paulo/Amanda
    instagramNotify.js   # alertas de renovação de token IG
    businessDate.js      # utilitário de datas em BRT
  jobs/
    adsCollectionJob.js       # coleta Google Ads + Meta Ads
    adsScheduler.js           # scheduler de coleta de anúncios
    weeklyReportJob.js        # relatório semanal via Claude
    weeklyReportScheduler.js  # scheduler do relatório
    instagramCollectionJob.js # coleta posts orgânicos do Instagram
    instagramScheduler.js     # scheduler Instagram + alerta token
    postAnalysisJob.js        # análise de posts com Claude
    populateSuggestionsJob.js # popular sugestões de conteúdo
    contentSuggestionsJob.js  # sugestões de conteúdo via Claude
    trendingSuggestionsJob.js # AGENTE PRINCIPAL: varre fontes → Claude → ContentSuggestion
    boostSuggestionsJob.js    # cruza posts orgânicos + análise INVEST + saldo do mês + CPL → sugere quanto investir em boost
    anomalyDetector.js        # detecção de anomalias em métricas
    ads/
      providers/
        googleAds.js    # Google Ads API v22
        metaAds.js      # Meta/Facebook Ads API v22.0
    sources/
      youtubeTrending.js   # YouTube Data API v3 — vídeos jurídicos em alta (BR, 7 dias)
      googleTrendsBR.js    # relatedQueries (rising) + Google News RSS para termos jurídicos
      redditBR.js          # r/conselhojuridico + r/direito — dúvidas reais (linguagem do cliente)
      instituicoesBR.js    # STJ + Câmara + Senado via Google News RSS — pipeline decisório de Brasília
```

---

## Modelos Prisma principais

| Modelo | Uso |
|--------|-----|
| `Lead` | Leads capturados pelo site |
| `CampaignDaily` | Métricas diárias de anúncios (Google + Meta) |
| `InstagramPost` | Posts orgânicos coletados da API do Instagram |
| `PostAnalysis` | Análise de cada post feita pelo Claude |
| `ContentSuggestion` | Sugestões de pauta geradas pelos jobs de IA |
| `WeeklyReport` | Relatórios semanais consolidados |
| `MonthlyGoal` | Metas mensais definidas pelo usuário |
| `BoostSuggestion` | Sugestões de impulsionamento (boost) — post + valor sugerido + leads estimados |
| `JobExecution` | Log de execução de todos os jobs (RUNNING → SUCCESS/FAILED) |

---

## Job de tendências — `trendingSuggestionsJob.js`

O job principal de IA. Varre 7 fontes em paralelo, consolida os sinais e pede ao Claude 7 sugestões de post.

**Fontes coletadas:**
1. **Conjur RSS** — `https://www.conjur.com.br/rss.xml` (15 manchetes)
2. **JOTA RSS** — `https://www.jota.info/feed` (15 manchetes)
3. **Migalhas RSS** — `https://www.migalhas.com.br/rss/quentes` (15 manchetes)
4. **YouTube BR** — `youtubeTrending.js` — YouTube Data API v3, busca 3 queries jurídicas, filtra memes (≈13 títulos, custa 300 unidades/dia)
5. **Google Trends BR** — `googleTrendsBR.js` — `relatedQueries` (rising) + Google News RSS (≈24 sinais)
6. **Reddit BR** — `redditBR.js` — `r/conselhojuridico` + `r/direito` (top da semana, ≈16 posts, sem auth, User-Agent obrigatório)
7. **Instituições BR** — `instituicoesBR.js` — STJ + Câmara + Senado via Google News RSS (≈15 manchetes do pipeline decisório de Brasília)

**Total típico:** ~113 sinais por execução → Claude Haiku gera 7 `ContentSuggestion` com formato (REEL/CAROUSEL/POST/STORIES), reasoning e fontes.

**Endpoint:** `POST /jobs/trending-suggestions/run` (requer JWT)

---

## Variáveis de ambiente relevantes

```env
ANTHROPIC_API_KEY=          # Claude Haiku — análise de tendências e conteúdo
YOUTUBE_API_KEY=            # YouTube Data API v3 — quota: 10.000 unidades/dia
INSTAGRAM_ACCESS_TOKEN=     # token manual, expira em 60 dias — emite alerta em 50 dias
INSTAGRAM_TOKEN_ISSUED_DATE=# YYYY-MM-DD — base para cálculo de expiração
INSTAGRAM_USER_ID=          # 17841401371420027 (@amandamramalho)
INSTAGRAM_ENABLED=          # true/false — liga jobs de coleta IG
INSTAGRAM_SCHEDULER_ENABLED=# true/false — liga ciclo diário automático
INSTAGRAM_RUN_UTC_HOUR=     # 4 = 01h BRT
INSTAGRAM_NOTIFY_EMAILS=    # destinatários do e-mail diário de análise
IG_PUBLISH_ENABLED=         # true/false — gate de segurança da publicação automática (Fase 1)
GOOGLE_ADS_*                # credenciais OAuth2 Google Ads
META_ADS_ACCESS_TOKEN=      # token de acesso Meta Ads
SITE_SECRET=                # autenticação do site → endpoint de leads
JOB_RUNNER_API_KEY=         # autenticação para disparo manual de jobs por cron externo
```

---

## Padrão de job

Todo job segue o ciclo:
1. Criar `JobExecution` com `status: "RUNNING"`
2. Executar lógica
3. Atualizar para `SUCCESS` ou `FAILED` com detalhes
4. Expor endpoint `POST /jobs/{nome}/run` em `server.js`

Usar `/novo-job` para scaffoldar novos jobs neste padrão.

---

## Deploy

- **Backend (Render):** push em `main` → deploy automático. Configurações em `render.yaml`.
- **Frontend (Vercel):** push em `main` → deploy automático.
- Migrations rodam automaticamente no start via `prisma:migrate:deploy` (configurar no buildCommand se necessário).

---

## Observações importantes

- O projeto não tem testes automatizados — validar manualmente antes de fazer push.
- `google-trends-api` `dailyTrends()` está quebrado (retorna 404 HTML). Usar `relatedQueries()` + Google News RSS em vez disso.
- YouTube API key está no `.env` como `YOUTUBE_API_KEY`. Se ausente, o job continua sem a fonte (graceful degradation via `console.warn`).
- Token do Instagram expira em 60 dias. O scheduler emite alerta por e-mail após 50 dias (configurável em `INSTAGRAM_TOKEN_ISSUED_DATE`). Procedimento completo de renovação em `docs/SETUP_INTEGRACOES.md` (seção Instagram).

---

## Agendamento e Publicação Instagram (em implementação a partir de 2026-04-24)

Substituição do mLabs pelo ciclo editorial integrado: a sugestão de IA vira agendamento, o sistema publica no Instagram no horário, marca a sugestão como FEITA, e o coletor traz a métrica para análise — tudo dentro do painel.

**Plano completo:** `Depósito/Plano — Agendamento e Publicação Instagram.html` (10 seções: contexto, ciclo, comparativo mLabs, API técnica, fases, schema, backend, frontend, impacto Addere, checklist).

**Fase 1 — MVP (em curso):**
- Schema novo: `ScheduledPost` + enums `ScheduledPostStatus` (DRAFT/SCHEDULED/PUBLISHING/PUBLISHED/FAILED/CANCELLED) e `PublishFormat` (PHOTO/CAROUSEL/REEL/STORY)
- Backend: `routes/scheduledPosts.js` (5 rotas REST) + `schedulers/postPublisher.js` (tick a cada 5min)
- Frontend: `SchedulePostModal.jsx`, `ScheduledPostBadge.jsx`, botão "Agendar" na tabela de sugestões
- Suporte: foto + carrossel + primeiro comentário opcional
- Auto-marca `ContentSuggestion.status = DONE` após publicar
- Gate de segurança: `IG_PUBLISH_ENABLED=false` enquanto não validado

**Fases seguintes:** Calendário Editorial + Reel (Fase 2), Upload de mídia via R2/S3 (Fase 3), Multi-cliente para Addere (Fase 4).

**Pré-requisito de token:** o `INSTAGRAM_ACCESS_TOKEN` precisa ter os escopos `instagram_content_publish` (para publicar) e `instagram_manage_insights` (para métricas). Renovação detalhada em `docs/SETUP_INTEGRACOES.md`.
