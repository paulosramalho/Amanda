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
4. **Agente de Tendências** — varre RSS de Conjur, JOTA e Migalhas e gera 6 sugestões de pautas em alta
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

## Em implementação — Agendamento e Publicação Instagram

**Início:** 24/04/2026 (virada do ciclo semanal — combinado em 21/04/2026).
**Plano completo:** `Depósito/Plano — Agendamento e Publicação Instagram.html`.
**Fase atual:** Fase 1 — MVP (ciclo fechado básico). Esforço estimado: 3-4 dias de desenvolvimento.

### Status por tarefa
| Tarefa | Status |
|--------|--------|
| Schema Prisma — `ScheduledPost` + enums | 🔲 A implementar |
| Migration `add-scheduled-posts` | 🔲 A implementar |
| Backend — `routes/scheduledPosts.js` (5 rotas REST) | 🔲 A implementar |
| Backend — `schedulers/postPublisher.js` (tick 5min) | 🔲 A implementar |
| `IG_PUBLISH_ENABLED=false` no Render | 🔲 A configurar |
| Frontend — `SchedulePostModal.jsx` | 🔲 A implementar |
| Frontend — `ScheduledPostBadge.jsx` + botão "Agendar" | 🔲 A implementar |
| Token com escopos `instagram_content_publish` + `instagram_manage_insights` | 🔲 A renovar |
| Teste end-to-end com `IG_PUBLISH_ENABLED=true` local | 🔲 |
| Ativar `IG_PUBLISH_ENABLED=true` no Render | 🔲 |
| Atualizar manual `AMR Ads Control — Manual de Utilização` para v1.2 | 🔲 |
