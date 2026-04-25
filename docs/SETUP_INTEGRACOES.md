# Setup de Integrações — Amanda Ads App

Atualizado em: 24/04/2026 (renovação do token Instagram + procedimento detalhado)

---

## Google Ads

### Contas e IDs
| Item | Valor |
|------|-------|
| Customer ID (conta principal) | 5439313784 |
| Login Customer ID (MCC/gestor) | 6627616245 |
| Developer Token | ENV: GOOGLE_ADS_DEVELOPER_TOKEN |

### Contas Google
| E-mail | Função |
|--------|--------|
| amanda@amandaramalho.adv.br | Administrador das contas 5439313784 e 6627616245 |
| financeiro@amandaramalho.adv.br | Autoriza o OAuth (conta usada no OAuth Playground) |

### OAuth 2.0 (ativo desde 18/04/2026)
| Item | Valor |
|------|-------|
| OAuth Client | `Google Ads Amanda Web` (Aplicativo da Web) |
| Client ID | 929549819941-3jmgccstt8v12jq7bufk1ifv08hltlam.apps.googleusercontent.com |
| Client Secret | ENV: GOOGLE_ADS_CLIENT_SECRET |
| Refresh Token | ENV: GOOGLE_ADS_REFRESH_TOKEN — gerado em 18/04/2026, **não expira** |
| Conta autorizada | financeiro@amandaramalho.adv.br |
| Scope | https://www.googleapis.com/auth/adwords |
| Projeto Google Cloud | amr-controles (807042223209) |
| Consent screen | **Produção** (publicado em 18/04/2026) |
| Redirect URI | https://developers.google.com/oauthplayground |

### Como regenerar token (se necessário)
1. Acessar OAuth Playground com OAuth client `Google Ads Amanda Web`
2. Scope: `https://www.googleapis.com/auth/adwords`
3. Conta: `financeiro@amandaramalho.adv.br`
4. Atualizar `GOOGLE_ADS_REFRESH_TOKEN` no Render

### Histórico
- 08/04/2026: OAuth original configurado — `google.status = success`, 1 campanha coletada ("Empresarial")
- 18/04/2026: Refresh token original expirado (`invalid_grant`) — renovado com novo client `Google Ads Amanda Web`

---

## Meta Ads

### Contas e IDs
| Item | Valor |
|------|-------|
| Ad Account ID | 246112715 (conta **pessoal** da Amanda — correta) |
| Business Manager | Amanda Ramalho (pessoal) |
| App utilizado | AMR Controles (ID: 1381147490481851) |
| App original (sem acesso dev) | AMR Ads Connector (ID: 2022860615281558, portfólio Advocacia) |

### System Users (portfólio Amanda Ramalho)
| Nome | ID | Função |
|------|----|--------|
| AMR_Bot_IG | 61573333585159 | Admin |
| AMR | 61583708257062 | Employee |

### Token de Acesso
| Item | Valor |
|------|-------|
| ENV | META_ADS_ACCESS_TOKEN |
| Permissões | `ads_read`, `ads_management`, `business_management` |
| Conta autorizada | Amanda Ramalho (Facebook pessoal) |
| Gerado em | 18/04/2026 |
| Expira em | ~17/06/2026 |

### Como renovar
1. Graph API Explorer → app `AMR Ads Connector`
2. Gerar token de curta duração com permissões acima
3. Trocar por token de longa duração: `GET /oauth/access_token?grant_type=fb_exchange_token&...`
4. Atualizar `META_ADS_ACCESS_TOKEN` no Render

### Atenção
- Conta `1546663345829444` era incorreta (portfólio empresarial) — conta correta é `246112715`
- Conta correta descoberta via `GET /me/adaccounts` no Graph API Explorer

---

## Instagram (conteúdo orgânico @amandamramalho)

### Conta e IDs
| Item | Valor |
|------|-------|
| Instagram User ID | 17841401371420027 |
| Handle | @amandamramalho |
| ENV | INSTAGRAM_USER_ID |

### Token de Acesso
| Item | Valor |
|------|-------|
| ENV | INSTAGRAM_ACCESS_TOKEN |
| Permissões atuais | `instagram_basic`, `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement`, `business_management` |
| Permissões a adicionar | `instagram_manage_insights` (para reach/impressions/etc) e `instagram_content_publish` (para Fase 1 do agendamento) |
| App | AMR Ads Connector (ID: 2022860615281558) — **NÃO** confundir com AMR Controles (1381147490481851), usado pelo Meta Ads |
| Conta admin | `amandaramalhoadv@gmail.com` (Amanda) — Paulo não admina a Page "Amanda M Ramalho" |
| Page do Facebook linkada ao IG | "Amanda M Ramalho" (ID `110004380611336`) — categoria "Blog pessoal" |
| Gerado em | 24/04/2026 (via Graph API Explorer) |
| Expira em | ~23/06/2026 (60 dias) |
| Alerta automático | A partir de 45 dias de uso (ENV: INSTAGRAM_TOKEN_ISSUED_DATE) |

### Como renovar o token (procedimento testado em 24/04/2026)
1. **Logar como Amanda** no Facebook: `amandaramalhoadv@gmail.com`. Sem isso, a Page "Amanda M Ramalho" não aparece.
2. Acessar Graph API Explorer: https://developers.facebook.com/tools/explorer/
3. No canto superior direito, **trocar o app para `AMR Ads Connector`** (ID 2022860615281558).
4. Adicionar permissões: `instagram_basic`, `instagram_manage_insights`, `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement`, `business_management`. Para a Fase 1 do agendamento, adicionar também `instagram_content_publish`.
5. Clicar **Generate Access Token**. Na tela de "Edit Access" / seleção de Pages, **marcar "Amanda M Ramalho"** (sem isso, o token não vê o IG `17841401371420027`).
6. **Validar com Token Debugger** (https://developers.facebook.com/tools/debug/accesstoken/): confirmar App ID `2022860615281558`, escopos esperados, e que IG `17841401371420027` está listado em `instagram_basic` e `instagram_manage_insights`.
7. **Estender token** clicando em "Estender token de acesso" no próprio Token Debugger — recebe long-lived (60 dias). Sem precisar do APP_SECRET.
8. No Render → `amanda-api` → Environment:
   - `INSTAGRAM_ACCESS_TOKEN` = novo long-lived
   - `INSTAGRAM_TOKEN_ISSUED_DATE` = data de hoje (YYYY-MM-DD)
9. Render faz redeploy automático (~2 min). Disparar manualmente "Coletor de Posts" para validar.

### Validação (debug rápido)
Cole no navegador (logado como Amanda) com o novo token:
```
https://graph.facebook.com/v22.0/me/accounts?access_token=NOVO_TOKEN
```
Confirmar que aparece a Page "Amanda M Ramalho" (ID `110004380611336`) com seu `access_token`. Em seguida:
```
https://graph.facebook.com/v22.0/110004380611336?fields=instagram_business_account,name&access_token=PAGE_TOKEN
```
Deve retornar `instagram_business_account.id = 17841401371420027`.

### Dados coletados por post
- caption, mediaType, likeCount, commentsCount, publishedAt, permalink
- reach, impressions, saved, shares, plays — exigem `instagram_manage_insights` no token. Sem ele, ficam como `null` (graceful degradation: `fetchInsights()` em `instagramCollectionJob.js:44-55` retorna `{}` no catch).

### Histórico
- 19/04/2026: Token original gerado pela Amanda — escopos `instagram_basic` + `instagram_manage_comments`. Sem `instagram_manage_insights` (não estava disponível no Explorer naquele momento).
- 24/04/2026: Renovação após expiração. Procedimento documentado acima. Continua sem `instagram_manage_insights` na primeira tentativa — adicionar na próxima renovação para ativar coleta de métricas. Necessário também `instagram_content_publish` para Fase 1 do agendamento.

### Credenciais — onde estão
- `C:\Amanda\Depósito\Instagram.txt` — App ID, App Secret e tokens (linha "Token permanente" + data de expiração).
- `C:\Amanda\Depósito\Instagram_Token_Exchange_URL.txt` — atalho do "Estender token de acesso" + URL manual de troca.
- Pasta `Depósito` está no `.gitignore` (`"Depósito/"` com aspas e acento).

---

## Anthropic (Claude AI)

### Configuração
| Item | Valor |
|------|-------|
| ENV | ANTHROPIC_API_KEY |
| Modelo | claude-haiku-4-5-20251001 |
| Uso | Análise de posts Instagram + sugestões de conteúdo |

### Jobs que usam a API
- `post_analysis`: analisa cada post (ação, score 1-10, justificativa, sugestão acionável)
- `content_suggestions`: gera 7 sugestões de conteúdo baseadas no histórico do perfil
- `trending_suggestions`: processa manchetes de RSS e gera 6 sugestões de pautas em alta

---

## Resend (E-mail)

### Configuração
| Item | Valor |
|------|-------|
| ENV | RESEND_API_KEY |
| Domínio remetente | ads@amandaramalho.adv.br (anúncios) / onboarding@resend.dev (fallback) |
| Destinatário padrão | amandaramalhoadv@gmail.com |

### E-mails enviados automaticamente
| Trigger | Assunto |
|---------|---------|
| Posts INVEST/REMOVE detectados | "AMR Ads — N posts precisam de atenção @amandamramalho" |
| Token Instagram com 45+ dias | Banner de alerta no e-mail de análise |
| Token Instagram com 55+ dias | Banner urgente no e-mail de análise |
| Anomalia em anúncios | Alerta de gasto/leads fora da média |
| Segunda-feira (relatório semanal) | Relatório com KPIs da semana |
| Token Instagram expirado (OAuthException) | "🔴 AMR Ads — Token Instagram expirado — ação necessária" |

---

## Integração Site → Leads (amandaramalho.adv.br)

### Como funciona
1. Usuário preenche formulário de contato no site
2. Next.js API route `/api/contato` chama `${BACKEND_URL}/api/site/lead` com `x-site-secret`
3. Backend cria lead com `source = SITE` no banco

### ENVs necessárias no Vercel (site)
| Variável | Valor |
|----------|-------|
| BACKEND_URL | https://amanda-api.onrender.com |
| SITE_SECRET | Igual ao `SITE_SECRET` do Render |
| RESEND_API_KEY | Envio do e-mail de contato para Amanda |

### Campos capturados do formulário
nome, email, telefone, área de interesse (`campaignName`), urgência e mensagem (ambos em `notes`)

---

## Telegram (Alertas Críticos)

### Configuração
| Item | Valor |
|------|-------|
| Bot | AMR Alerts Bot |
| ENV TOKEN | TELEGRAM_BOT_TOKEN — `8637747827:AAH...` |
| ENV CHAT | TELEGRAM_CHAT_ID — `8746739304` |
| Destinatário | paulosramalho@gmail.com (conta Telegram vinculada ao número) |

### E-mails de alerta crítico
| ENV | Valor |
|-----|-------|
| ADMIN_ALERT_EMAILS | paulosramalho@gmail.com,amandaramalhoadv@gmail.com |

### Quando dispara
- Token do Instagram expirado (`OAuthException` / erros 190, 467, 463 da Graph API)
- Testável via `POST /jobs/admin-alert/test` (requer JWT)

### Canais
1. **E-mail** via Resend para todos os endereços em `ADMIN_ALERT_EMAILS`
2. **Telegram** via Bot API para o chat `TELEGRAM_CHAT_ID`

---

## Render (Backend — amanda-api)

| Item | Valor |
|------|-------|
| URL | https://amanda-api.onrender.com |
| Plano | Free (dorme após inatividade — keep-alive externo ativo) |
| Root Directory | backend |
| Build Command | npm install |
| Start Command | npm run start |

---

## Vercel (Frontend — painel)

| Item | Valor |
|------|-------|
| URL produção | https://amr-frontend.vercel.app (ou domínio customizado) |
| Root Directory | frontend |
| VITE_API_BASE_URL | https://amanda-api.onrender.com |

---

## Google Cloud Projects

| Número | ID | Conta | Uso |
|--------|----|-------|-----|
| 466614986518 | project-8d2d1f62... | paulosramalho@gmail.com | Portal Pessoal Drive |
| 807042223209 | amr-controles | financeiro@amandaramalho.adv.br | AMR Gmail Poller, AMR Controles Web, Google Ads Amanda Web |
| 929549819941 | não localizado | ? | OAuth original Google Ads (expirado — substituído) |

---

## Neon (PostgreSQL)

| Item | Valor |
|------|-------|
| Banco | neondb |
| Schema | public |
| DATABASE_URL | Pooler (ep-frosty-moon-am8sy5u6-pooler.c-5.us-east-1.aws.neon.tech) |
| DIRECT_URL | Direto sem pooler (ep-frosty-moon-am8sy5u6.c-5.us-east-1.aws.neon.tech) — usado em migrations |
