# Setup de Integrações — Amanda Ads App

Atualizado em: 18/04/2026

---

## Google Ads

### Contas e IDs
| Item | Valor |
|------|-------|
| Customer ID (conta principal) | 5439313784 |
| Login Customer ID (MCC/gestor) | 6627616245 |
| Developer Token | configurado no Render (ENV: GOOGLE_ADS_DEVELOPER_TOKEN) |

### Conta Google do Google Ads
| Email | Função |
|-------|--------|
| amanda@amandaramalho.adv.br | Administrador das contas 5439313784 e 6627616245 |
| financeiro@amandaramalho.adv.br | Usada para autorizar o OAuth em 18/04/2026 |

### OAuth 2.0 (configuração ativa — 18/04/2026)
| Item | Valor |
|------|-------|
| OAuth Client | `Google Ads Amanda Web` (Aplicativo da Web) |
| Client ID | 807042223209-7qlnbmmkdgu7dc0bssps0ue5b4tac8f0.apps.googleusercontent.com |
| Client Secret | configurado no Render (GOOGLE_ADS_CLIENT_SECRET) |
| Refresh Token | gerado em 18/04/2026 via OAuth Playground, configurado no Render |
| Conta autorizada | financeiro@amandaramalho.adv.br |
| Scope | https://www.googleapis.com/auth/adwords |
| Projeto Google Cloud | amr-controles (807042223209) |
| Consent screen | **Produção** (publicado em 18/04/2026) — refresh token não expira |
| Redirect URI registrado | https://developers.google.com/oauthplayground |

### Atenção
- Consent screen em **Produção** — refresh token não expira (apenas se amanda@ revogar o acesso)
- Se necessário regenerar: OAuth Playground → `Google Ads Amanda Web` → scope `adwords` → conta `amanda@amandaramalho.adv.br`

### Histórico
- 08/04/2026: OAuth original configurado e validado — `google.status = success`, 1 campanha coletada ("Empresarial")
- 09/04/2026: Última coleta bem-sucedida com credenciais originais
- 18/04/2026: Refresh token original expirado (`invalid_grant`) — credenciais renovadas com novo OAuth client `Google Ads Amanda Web`

---

## Meta Ads / Instagram

### Contas e IDs
| Item | Valor |
|------|-------|
| Ad Account ID | 1546663345829444 |
| Portfólio Business Manager | Amanda Ramalho (pessoal) |
| App utilizado | AMR Controles (ID: 1381147490481851) |
| App original (sem acesso dev) | AMR Ads Connector (ID: 2022860615281558, portfólio Advocacia) |

### System Users (portfólio Amanda Ramalho)
| Nome | ID | Função |
|------|----|--------|
| AMR_Bot_IG | 61573333585159 | Admin |
| AMR | 61583708257062 | Employee |

### Token de Acesso (configuração ativa — 18/04/2026)
| Item | Valor |
|------|-------|
| META_ADS_ACCESS_TOKEN | Gerado por Amanda via Graph API Explorer (AMR Ads Connector) |
| Permissões do token | `ads_read`, `ads_management`, `business_management` |
| Conta autorizada | Amanda Ramalho (Facebook pessoal) |
| App utilizado | AMR Ads Connector (ID: 2022860615281558) |
| META_ADS_ACCOUNT_ID | **246112715** (conta correta — pessoal da Amanda) |
| META_ADS_ENABLED | true |
| Status | **OPERACIONAL** — `meta.status = success` validado em 18/04/2026 |

### Atenção
- Token de longa duração (válido ~60 dias) gerado em 18/04/2026
- Renovar via Graph API Explorer → exchange token antes de expirar
- Conta `1546663345829444` era incorreta — era do portfólio empresarial, não da conta pessoal
- Conta correta `246112715` descoberta via `GET /me/adaccounts` no Graph API Explorer

---

## Render (Backend — amanda-api)

| Variável | Status |
|----------|--------|
| ADS_COLLECTION_SCHEDULER_ENABLED | **true** (ativado em 18/04/2026) |
| GOOGLE_ADS_ENABLED | true |
| META_ADS_ENABLED | true |
| GOOGLE_ADS_CLIENT_ID | atualizado em 18/04/2026 |
| GOOGLE_ADS_CLIENT_SECRET | atualizado em 18/04/2026 |
| GOOGLE_ADS_REFRESH_TOKEN | atualizado em 18/04/2026 |
| META_ADS_ACCESS_TOKEN | adicionado em 18/04/2026 (permissões insuficientes) |
| DATABASE_URL | configurado (Neon PostgreSQL) |
| JOB_RUNNER_API_KEY | configurado |

---

## Google Cloud Projects identificados

| Número do projeto | ID | Conta | Uso |
|-------------------|----|-------|-----|
| 466614986518 | project-8d2d1f62... | paulosramalho@gmail.com | Portal Pessoal Drive |
| 807042223209 | amr-controles | financeiro@amandaramalho.adv.br | AMR Gmail Poller, AMR Controles Web, Google Ads Amanda Web |
| 929549819941 | não localizado | ? | OAuth original Google Ads (expirado — substituído) |
