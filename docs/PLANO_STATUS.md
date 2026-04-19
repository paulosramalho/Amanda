# Plano de Implantação e Status — Amanda Ads App

Atualizado em: 18/04/2026
Escopo: Google Ads e Meta Ads para Amanda Ramalho (@amandamramalho — marca pessoal).
Regra de data de negócio: sempre `UTC-3 T12:00:00` via `toBusinessDateAtNoon()`.

---

## Status geral: OPERACIONAL EM PRODUÇÃO

Todos os passos do plano original foram concluídos. Sistema em produção desde 18/04/2026.

---

## O que está rodando

### Coleta automática (backend — Render)
- **Google Ads:** operacional, coleta diária às 15h UTC via scheduler
- **Meta Ads:** operacional, conta `246112715` (pessoal Amanda), app `AMR Ads Connector`
- **Scheduler:** `ADS_COLLECTION_SCHEDULER_ENABLED=true`, tick a cada 60s
- **Detecção de anomalias:** roda após cada coleta — alerta por email se gasto/leads desviarem >40% da média 7 dias

### Relatório semanal
- Gerado automaticamente toda segunda-feira às 12h UTC (09h BRT)
- Email enviado para `amandaramalhoadv@gmail.com` via Resend (`ads@amandaramalho.adv.br`)
- Histórico navegável no dashboard (até 12 semanas)

### Dashboard (frontend — Vercel)
Protegido por autenticação JWT (senha configurada em `DASHBOARD_PASSWORD`). Três abas:
- **Visão Geral:** KPIs (7/14/30 dias), meta mensal com barra de progresso, cards por plataforma, gráfico gasto×leads, tabela de campanhas com detalhe diário ao clicar
- **Relatório Semanal:** análise semanal com navegação entre semanas
- **Leads:** registro manual de leads com origem, status, fee potencial

---

## Passos — status final

| Passo | Status | Concluído em |
|-------|--------|--------------|
| 1. Fundação técnica | ✅ Concluído | 07/04/2026 |
| 2. Banco e Prisma | ✅ Concluído | 08/04/2026 |
| 3. Modelo de dados | ✅ Concluído | 08/04/2026 |
| 4. Coleta automática Ads | ✅ Concluído | 18/04/2026 |
| 5. API de negócio | ✅ Concluído | 18/04/2026 |
| 6. Relatório semanal | ✅ Concluído | 18/04/2026 |
| 7. Frontend dedicado | ✅ Concluído | 18/04/2026 |
| 8. Alertas e governança | ✅ Concluído | 18/04/2026 |
| 9. Go-live controlado | ✅ Concluído | 18/04/2026 |

---

## ENVs de produção (Render — amanda-api)

| Variável | Status |
|----------|--------|
| DATABASE_URL | ✅ Neon PostgreSQL (pooler) |
| DIRECT_URL | ✅ Neon PostgreSQL (direto, sem -pooler, sem channel_binding) |
| GOOGLE_ADS_ENABLED | ✅ true |
| GOOGLE_ADS_CLIENT_ID | ✅ OAuth client `Google Ads Amanda Web` |
| GOOGLE_ADS_CLIENT_SECRET | ✅ configurado |
| GOOGLE_ADS_REFRESH_TOKEN | ✅ gerado em 18/04/2026 (conta amanda@) |
| GOOGLE_ADS_DEVELOPER_TOKEN | ✅ configurado |
| META_ADS_ENABLED | ✅ true |
| META_ADS_ACCOUNT_ID | ✅ 246112715 (conta pessoal Amanda) |
| META_ADS_ACCESS_TOKEN | ✅ token longa duração — **expira ~17/06/2026** |
| ADS_COLLECTION_SCHEDULER_ENABLED | ✅ true |
| JOB_RUNNER_API_KEY | ✅ configurado |
| DASHBOARD_PASSWORD | ✅ configurado |
| JWT_SECRET | ✅ configurado |
| RESEND_API_KEY | ✅ configurado |
| NOTIFY_EMAIL_TO | ✅ amandaramalhoadv@gmail.com |
| NOTIFY_EMAIL_FROM | ✅ ads@amandaramalho.adv.br |

---

## Alertas operacionais

| Data | Ação |
|------|------|
| 10/06/2026 | Renovar token Meta Ads (expira ~17/06/2026) — lembrete agendado |

---

## Integrações — resumo

Ver `docs/SETUP_INTEGRACOES.md` para contas, IDs, OAuth e histórico completo.
