# Plano de Implantação e Status — Amanda Ads App

Atualizado em: 24/04/2026
Escopo: Google Ads, Meta Ads, Instagram orgânico (@amandamramalho), leads do site, agentes de IA, **agendamento e publicação Instagram (em implementação)**.
Regra de data de negócio: sempre `UTC-3 T12:00:00` via `toBusinessDateAtNoon()`.

---

## Status geral: OPERACIONAL EM PRODUÇÃO

Sistema em produção desde 18/04/2026. Agentes de Instagram ativos desde 19/04/2026.

---

## O que está rodando

### Coleta de Anúncios (scheduler — 15h UTC / 12h BRT)
- **Google Ads:** operacional, coleta diária via OAuth refresh token
- **Meta Ads:** operacional, conta `246112715` (pessoal Amanda)
- **Detecção de anomalias:** roda após cada coleta — alerta por e-mail se gasto/leads desviarem >40% da média 7 dias

### Scheduler de Instagram (scheduler — 04h UTC / 01h BRT)
Ciclo diário automático na seguinte ordem:
1. **Coleta de Posts** — busca posts e métricas do @amandamramalho via Graph API
2. **Análise de Posts** — Claude Haiku avalia cada post sem análise (ação, score, justificativa, sugestão)
3. **Sugestões de Conteúdo** — analisa histórico do perfil e gera 7 sugestões de novos posts
4. **Agente de Tendências** — varre 7 fontes em paralelo (Conjur, JOTA, Migalhas, YouTube BR, Google Trends BR, Reddit BR, Instituições BR — STJ+Câmara+Senado) e gera 7 sugestões de pautas em alta
5. **Notificador** — envia e-mail com posts INVEST/REMOVE e alerta de renovação de token

### Relatório Semanal
- Gerado automaticamente toda segunda-feira às 12h UTC (09h BRT)
- E-mail enviado para `amandaramalhoadv@gmail.com` via Resend (`ads@amandaramalho.adv.br`)
- Histórico navegável no dashboard (até 12 semanas)

### Integração Site → Leads
- Formulário de contato em `amandaramalho.adv.br` cria leads automaticamente no painel
- Origem: `SITE`
- Campos capturados: nome, e-mail, telefone, área de interesse, urgência, mensagem
- Autenticação: header `x-site-secret` (compartilhado entre Vercel e Render)

### Dashboard (frontend — Vercel)
Protegido por JWT (`DASHBOARD_PASSWORD`). Abas:
- **Visão Geral:** KPIs (7/14/30 dias), meta mensal, cards por plataforma, gráfico gasto×leads, tabela de campanhas
- **Relatório Semanal:** análise semanal com navegação entre semanas
- **Leads:** registro de leads (manual + site), com e-mail, urgência, necessidade e status editável
- **Conteúdo:** duas sub-abas:
  - *Conteúdo:* posts coletados com análise (ação, score, justificativa, sugestão) e filtro por ação
  - *Sugestão de Conteúdo:* sugestões geradas pelos agentes com status editável (Pendente/Feito/Ignorado)
- **Agentes:** status, mensagem de erro detalhada e botão **Executar** por agente para disparo manual

---

## ENVs de produção (Render — amanda-api)

| Variável | Status | Observação |
|----------|--------|------------|
| DATABASE_URL | ✅ | Neon PostgreSQL (pooler) |
| DIRECT_URL | ✅ | Neon PostgreSQL (direto — migrations) |
| JWT_SECRET | ✅ | — |
| DASHBOARD_PASSWORD | ✅ | `amr@2026` |
| GOOGLE_ADS_ENABLED | ✅ | true |
| GOOGLE_ADS_CLIENT_ID | ✅ | OAuth client `Google Ads Amanda Web` |
| GOOGLE_ADS_CLIENT_SECRET | ✅ | — |
| GOOGLE_ADS_REFRESH_TOKEN | ✅ | Gerado em 18/04/2026 — não expira (consent em Produção) |
| GOOGLE_ADS_DEVELOPER_TOKEN | ✅ | — |
| META_ADS_ENABLED | ✅ | true |
| META_ADS_ACCOUNT_ID | ✅ | 246112715 (conta pessoal Amanda) |
| META_ADS_ACCESS_TOKEN | ✅ | **Expira ~17/06/2026** — renovar antes |
| ADS_COLLECTION_SCHEDULER_ENABLED | ✅ | true |
| RESEND_API_KEY | ✅ | — |
| NOTIFY_EMAIL_TO | ✅ | amandaramalhoadv@gmail.com |
| NOTIFY_EMAIL_FROM | ✅ | ads@amandaramalho.adv.br |
| ANTHROPIC_API_KEY | ✅ | Claude Haiku — análise de posts |
| INSTAGRAM_ENABLED | ✅ | true |
| INSTAGRAM_ACCESS_TOKEN | ✅ | **Expira ~23/06/2026** — renovar antes (alerta automático) |
| INSTAGRAM_USER_ID | ✅ | 17841401371420027 (@amandamramalho) |
| INSTAGRAM_SCHEDULER_ENABLED | ✅ | true |
| INSTAGRAM_RUN_UTC_HOUR | ✅ | 4 (01h BRT) |
| INSTAGRAM_NOTIFY_EMAILS | ✅ | amandaramalhoadv@gmail.com |
| INSTAGRAM_TOKEN_ISSUED_DATE | ✅ | 2026-04-24 |
| IG_PUBLISH_ENABLED | 🔲 | Adicionar ao iniciar Fase 1 do agendamento (default `false`) |
| SITE_SECRET | ✅ | Compartilhado com Vercel do site |
| ADMIN_ALERT_EMAILS | ✅ | paulosramalho@gmail.com,amandaramalhoadv@gmail.com |
| TELEGRAM_BOT_TOKEN | ✅ | Bot `AMR Alerts Bot` — alerta crítico por Telegram |
| TELEGRAM_CHAT_ID | ✅ | 8746739304 |

### ENVs de produção (Vercel — site amandaramalho.adv.br)

| Variável | Status | Observação |
|----------|--------|------------|
| BACKEND_URL | ✅ | https://amanda-api.onrender.com |
| SITE_SECRET | ✅ | Igual ao Render |
| RESEND_API_KEY | ✅ | Envio do e-mail de contato para Amanda |

---

## Alertas operacionais

| Data | Ação |
|------|------|
| 10/06/2026 | Renovar Meta Ads token (expira ~17/06/2026) |
| 08/06/2026 | Renovar Instagram token (emitido 24/04/2026 — alerta automático a partir de 45 dias) |

---

## Banco de dados — migrações aplicadas

| Migration | Data | O que faz |
|-----------|------|-----------|
| `20260408023000_init` | 08/04/2026 | Schema inicial (campanhas, leads, jobs, relatórios) |
| `20260419_instagram` | 19/04/2026 | InstagramPost, PostAnalysis |
| `20260419223143_add_site_lead_source` | 19/04/2026 | Enum SITE em LeadSource |
| `20260420003530_add_suggestion_to_post_analysis` | 20/04/2026 | Campo suggestion em PostAnalysis |
| `20260420011039_add_content_suggestions` | 20/04/2026 | ContentSuggestion, enums ContentFormat e ContentSuggestionStatus |

---

## Integrações — resumo

Ver `docs/SETUP_INTEGRACOES.md` para contas, IDs, OAuth e histórico completo.

---

## Agendamento e Publicação Instagram — Status

**Início:** 24/04/2026 (virada do ciclo semanal — combinado em 21/04/2026).
**Plano completo:** `Depósito/Plano — Agendamento e Publicação Instagram.html`.
**Manual standalone:** `Depósito/Manual — Agendamento e Publicação Instagram.html`.
**Manual principal:** seção 10 em `Depósito/AMR Ads Control — Manual de Utilização.html` (v1.2).

### Fase 1 — MVP (✅ COMPLETA — 25/04/2026)
| Tarefa | Status |
|--------|--------|
| Schema Prisma — `ScheduledPost` + enums (`ScheduledPostStatus`, `PublishFormat`) | ✅ |
| Migration `20260424183000_add_scheduled_posts` (aplicada manualmente via Neon SQL Editor) | ✅ |
| Backend — 5 rotas inline em `server.js` (`/api/scheduled-posts` GET/POST/PUT/DELETE + publish-now) | ✅ |
| Backend — `jobs/postPublisherScheduler.js` (tick 5min, retry 3x, `JobExecution` log) | ✅ |
| Backend — `instagram_notify` agora também grava `JobExecution` | ✅ |
| `IG_PUBLISH_ENABLED` configurado no Render (true) | ✅ |
| Frontend — `SchedulePostModal`, `ScheduledPostBadge`, botão "📅 Agendar" na sub-aba Sugestões | ✅ |
| Token com escopos `instagram_content_publish` + `instagram_manage_insights` | ✅ (renovado 25/04/2026) |
| `AGENT_REGISTRY` + `AGENT_JOB_ENDPOINTS` para `post_publisher` e `instagram_notify` | ✅ |
| Manual `AMR Ads Control — Manual de Utilização` atualizado para v1.2 | ✅ |
| Manual standalone `Manual — Agendamento e Publicação Instagram` v1.0 criado | ✅ |
| Teste end-to-end com publicação real | 🔲 pendente — quando Amanda quiser publicar 1º post real |

### Fase 2 — Calendário + Reel (✅ COMPLETA — 25/04/2026)
| Tarefa | Status |
|--------|--------|
| **Calendário Editorial visual** — sub-aba "Calendário" em Conteúdo, grade mensal 7×6 com cards por status | ✅ commit `cb164fa` |
| **Reciclagem** — botão 🔄 em InstagramPost (sub-aba Conteúdo) re-abre modal com legenda/formato pré-preenchidos | ✅ commit `598492b` |
| **IA sugere hashtags** no `SchedulePostModal` — Claude Haiku, botão ✨ no campo 1º comentário | ✅ commit `41793e9` |
| **IA sugere melhor horário** — botão 🕐 + análise estatística do histórico (likes + 2×comentários + reach/10) | ✅ commit `e759ffa` |
| **Suporte a Reel** — `publishReel` com polling do `status_code` (FINISHED/ERROR/EXPIRED), timeout 4min | ✅ commit `09e7d0f` |
| **Suporte a Stories** — `publishStory` (foto síncrona ou vídeo com polling), 24h, ratio 9:16 | ✅ commit `50fb3c1` (extra além do plano Fase 2) |

### Melhorias gerais (fora do plano original)
| Mudança | Status | Commit |
|---------|--------|--------|
| Indicadores de qualidade nos KPIs (badge ↑/→/↓ com delta% vs período anterior; CTR usa benchmark fixo) | ✅ | `524ba60` (26/04/2026) |
| Fix do alerta "Última coleta há Xh" perpétuo (jobName mismatch ads_collection_daily → ads_collection) | ✅ | `524ba60` |
| Stories habilitado no modal (foto síncrona + vídeo assíncrono) | ✅ | `50fb3c1` |
| Modais com header/footer fixos e centro rolável (regra global em memória) | ✅ | `954f6c6` |
| KPIs — chip de **tendência** (▲ subiu / ▬ estável / ▼ baixou) separado do chip de **qualidade** (bom/neutro/atenção) | ✅ | `9db3799` (26/04/2026) |
| Backend — comparação de tendência passa a ser snapshot de hoje vs snapshot de ontem (janela rolante deslocada 1 dia) em vez de período N vs período N-1; resolve "sem comparação" quando há <2× `days` de dados coletados | ✅ | `aca20b2` (26/04/2026) |
| Agente de Tendências — adicionada 6ª fonte: **Reddit BR** (`r/conselhojuridico` + `r/direito`, top da semana, sem auth) — captura linguagem e dor real do cliente potencial | ✅ | `7d1fea7` (26/04/2026) |
| Agente de Tendências — adicionada 7ª fonte: **Instituições BR** (STJ + Câmara + Senado via Google News RSS) — pipeline decisório de Brasília; total de sinais por execução subiu de ~82 para ~113 | ✅ | `2da7a4a` (26/04/2026) |
| Novo agente **Sugestor de Impulsionamento** (`boost_suggestions`) — cruza posts orgânicos com tração + análise INVEST + saldo do mês (`MonthlyGoal`) + CPL histórico Meta, e sugere quanto investir em boost por post (mínimo R$ 30, teto 25% do saldo). Nova tabela `BoostSuggestion`, sub-aba "Impulsionar" em Conteúdo, status PENDING/APPLIED/DISMISSED. Aplicação manual (Amanda abre o post no IG e impulsiona com o valor sugerido) — execução automática fica para fase futura. | ✅ | (sessão 26/04/2026) |

### Estado atual (recuperação de contexto)
Fases 1, 2 e 3 ✅ código implementado. **Próximo passo:** aguardando Paulo configurar Cloudflare R2 (criar bucket + API token + adicionar 5 env vars no Render). Depois disso, Fase 3 estará operacional. Em seguida: Fase 4 (multi-cliente Addere — não iniciada).

### Fase 3 — Upload de mídia direto via R2 (✅ código pronto, 🔲 aguardando setup R2)
| Tarefa | Status |
|--------|--------|
| Backend — `lib/r2.js` (S3-compatible client, upload/list/delete/exists) | ✅ commit pendente |
| Backend — endpoints `POST /api/media/upload` (multipart) + `GET /api/media` + `DELETE /api/media` | ✅ |
| Backend — validação por tipo (JPEG/PNG ≤8MB, MP4/MOV ≤1GB) | ✅ |
| Frontend — botão 📤 inline em cada URL row do `SchedulePostModal` (upload direto, preenche o campo) | ✅ |
| Frontend — botão 📚 Biblioteca (modal com grid das mídias enviadas, click para selecionar) | ✅ |
| `.env.example` + `render.yaml` com vars `R2_*` | ✅ |
| **Setup Cloudflare R2** (Paulo) — bucket `amanda-instagram-media`, R2.dev pública, API token Object R/W | 🔲 manual |
| Env vars no Render | 🔲 manual após setup |
| Teste end-to-end: upload → URL pública → publicar Instagram | 🔲 |

**Setup detalhado para Paulo:** instruções no chat da sessão de 25/04/2026 (também salvas em `Depósito/R2.txt` quando preenchido).

### Fase 4 — Multi-cliente Addere (🔲)
- Multi-conta Instagram por cliente
- Fluxo de aprovação editor → revisor → publicador
- Multi-plataforma (LinkedIn etc)
- White-label
