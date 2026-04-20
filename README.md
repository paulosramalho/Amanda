# Amanda Ads App

Painel de controle para monitoramento de anúncios (Google Ads, Meta Ads), conteúdo orgânico do Instagram (@amandamramalho) e gestão de leads — com agentes de IA para análise e sugestão de conteúdo.

## Estrutura do repositório

```
Amanda/
├── backend/          # API Node.js (Express + Prisma) — deploy no Render
├── frontend/         # App Vite + React — deploy na Vercel
└── docs/
    ├── PLANO_STATUS.md         # status de implantação e ENVs de produção
    └── SETUP_INTEGRACOES.md    # contas, IDs, OAuth e tokens por integração
```

---

## Backend — Endpoints

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login` | Retorna JWT (body: `{ password }`) |

### Dashboard (requer JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/dashboard/summary` | KPIs do período (`?days=`) |
| GET | `/dashboard/daily` | Série diária (`?days=`) |
| GET | `/dashboard/campaigns` | Campanhas do período |
| GET | `/dashboard/campaigns/:platform/:id/daily` | Detalhe diário de campanha |
| GET | `/dashboard/weekly-reports` | Lista relatórios semanais |
| GET | `/dashboard/monthly-goal` | Meta mensal (`?month=YYYY-MM`) |
| GET | `/dashboard/instagram-posts` | Posts coletados com análise |
| GET | `/dashboard/content-suggestions` | Sugestões de conteúdo geradas pelos agentes |
| GET | `/dashboard/agents` | Status e última execução de cada agente |

### Leads (requer JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/leads` | Lista leads |
| POST | `/leads` | Cria lead manual |
| PATCH | `/leads/:id` | Atualiza status do lead |

### Integração site → leads
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/site/lead` | Cria lead vindo do formulário do site (requer `x-site-secret`) |

### Jobs (requer JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/jobs/ads-collection/run` | Dispara coleta de anúncios manualmente |
| GET | `/jobs/ads-collection/config` | Configuração atual do scheduler de anúncios |
| GET | `/jobs/ads-collection/recent` | Execuções recentes |
| POST | `/jobs/instagram-collection/run` | Coleta posts do Instagram manualmente |
| POST | `/jobs/post-analysis/run` | Analisa posts com Claude (body: `{ forceReanalyze }`) |
| POST | `/jobs/populate-suggestions/run` | Preenche campo `suggestion` sem reclassificar ação |
| POST | `/jobs/content-suggestions/run` | Gera sugestões baseadas no histórico do perfil |
| POST | `/jobs/trending-suggestions/run` | Varre RSS e gera sugestões de tendência |
| PATCH | `/content-suggestions/:id` | Atualiza status de sugestão (PENDING/DONE/DISMISSED) |
| POST | `/jobs/instagram-notify/test` | Envia e-mail de teste de análise |
| POST | `/jobs/admin-alert/test` | Dispara alerta crítico de teste (e-mail + Telegram) |

### Utilitários
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Mapa de rotas |
| GET | `/health` | Health check |
| GET | `/health/db` | Health check do banco |
| GET | `/business-date` | Data de negócio atual (UTC-3) |

---

## Agentes de IA

Todos os agentes rodam automaticamente às 01h BRT via scheduler interno (`instagramScheduler.js`):

| Agente | Job Name | O que faz |
|--------|----------|-----------|
| Coletor de Posts | `instagram_collection` | Coleta posts e métricas do @amandamramalho via Instagram Graph API |
| Analisador de Posts | `post_analysis` | Avalia qualidade com Claude Haiku — ação (INVEST/REDIRECT/REMOVE/MONITOR/MAINTAIN), score 1-10, justificativa e sugestão |
| Sugestor de Conteúdo | `content_suggestions` | Analisa histórico do perfil e sugere 7 novos temas/formatos |
| Agente de Tendências | `trending_suggestions` | Varre RSS de Conjur, JOTA e Migalhas — sugere 6 posts sobre pautas em alta |
| Notificador | `instagram_notify` | Envia e-mail com posts INVEST/REMOVE e alerta de renovação de token |
| Coletor de Anúncios | `ads_collection` | Coleta métricas diárias de Google Ads e Meta Ads (15h UTC) |

---

## Banco de dados (Neon + Prisma)

**Schema:** `backend/prisma/schema.prisma`

### Modelos principais
| Modelo | Tabela | Descrição |
|--------|--------|-----------|
| `CampaignDaily` | `campanhas_diarias` | Métricas diárias por campanha/plataforma |
| `JobExecution` | `jobs_execucao` | Registro de execuções de todos os agentes |
| `Lead` | `leads` | Leads manuais e do formulário do site |
| `WeeklyReport` | `weekly_reports` | Relatórios semanais gerados automaticamente |
| `MonthlyGoal` | `monthly_goals` | Meta mensal de gasto e leads |
| `InstagramPost` | `instagram_posts` | Posts coletados do @amandamramalho |
| `PostAnalysis` | `post_analyses` | Análise de cada post (ação, score, reasoning, suggestion) |
| `ContentSuggestion` | `content_suggestions` | Sugestões de conteúdo geradas pelos agentes |

### Enums
- `LeadSource`: GOOGLE_ADS, META_ADS, INSTAGRAM_ADS, ORGANIC, REFERRAL, SITE, OTHER
- `LeadStatus`: NEW, CONTACTED, QUALIFIED, WON, LOST, ARCHIVED
- `ContentFormat`: POST, CAROUSEL, STORIES, REEL
- `ContentSuggestionStatus`: PENDING, DONE, DISMISSED

### Scripts
```bash
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:migrate:deploy
```

---

## Deploy

### Backend (Render)
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm run start`

### Frontend (Vercel)
- Framework: Vite
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Env var obrigatória: `VITE_API_BASE_URL=https://amanda-api.onrender.com`

### Site (Vercel — repositório separado: controles-amr)
- Projeto: `amandaramalho.adv.br`
- Env vars obrigatórias: `BACKEND_URL=https://amanda-api.onrender.com`, `SITE_SECRET=<igual ao Render>`

---

## Variáveis de ambiente

Ver `backend/.env` para desenvolvimento local e `docs/PLANO_STATUS.md` para produção.

### Variáveis críticas de produção (Render)
| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Neon PostgreSQL (pooler) |
| `JWT_SECRET` | Segredo dos tokens JWT |
| `DASHBOARD_PASSWORD` | Senha do painel |
| `ANTHROPIC_API_KEY` | Claude Haiku para análise de posts |
| `INSTAGRAM_ACCESS_TOKEN` | Token Instagram Graph API (~60 dias) |
| `INSTAGRAM_USER_ID` | `17841401371420027` (@amandamramalho) |
| `INSTAGRAM_TOKEN_ISSUED_DATE` | Data de emissão do token (YYYY-MM-DD) |
| `INSTAGRAM_SCHEDULER_ENABLED` | `true` |
| `INSTAGRAM_RUN_UTC_HOUR` | `4` (01h BRT) |
| `INSTAGRAM_NOTIFY_EMAILS` | `amandaramalhoadv@gmail.com` |
| `RESEND_API_KEY` | Envio de e-mails via Resend |
| `SITE_SECRET` | Segredo compartilhado com o site |
| `ADMIN_ALERT_EMAILS` | E-mails para alertas críticos (vírgula-separados) |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram para alertas críticos |
| `TELEGRAM_CHAT_ID` | Chat ID do Telegram que recebe os alertas |

---

## Regras de negócio

- **Timezone:** UTC-3 (America/Belem). Toda lógica de "hoje" usa `toBusinessDateAtNoon()`.
- **Data de negócio:** `YYYY-MM-DDT12:00:00Z` (meio-dia UTC = 09h BRT — evita cruzamento de dia).
- **Token Instagram:** expira em ~60 dias. Alerta por e-mail a partir de 45 dias de uso.
- **Alertas críticos:** falhas de token ou coleta disparam e-mail (`ADMIN_ALERT_EMAILS`) + mensagem no Telegram (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`) com passos de correção.
