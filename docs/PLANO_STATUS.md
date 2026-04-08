# Plano de Implantacao e Status - Amanda Ads App

Atualizado em: 08/04/2026
Escopo: Google Ads, Meta Ads e Instagram Ads para Amanda Ramalho Advogados.
Regra de data de negocio: usar sempre `UTC-3 T12:00:00` (`YYYY-MM-DDT12:00:00-03:00`).

## Objetivo de negocio
Atrair leads qualificados para conversao em clientes de fee mensal, com foco em advocacia empresarial para pequenas e medias empresas de Sao Paulo.

## Plano geral a ser implantado
1. Fundacao tecnica do app (repo, backend, deploy base, healthcheck).
2. Banco de dados e camada ORM (Neon + Prisma + migrations).
3. Modelo de dados de operacao (leads, campanhas diarias, jobs, relatorio semanal).
4. Coleta automatica de dados (Google Ads, Meta Ads/Instagram, GA4 quando aplicavel).
5. API de negocio (dashboard, leads, consolidacoes semanais).
6. Agente de monitoramento e resumo executivo semanal.
7. Frontend dedicado (painel operacional + filtros + historico).
8. Alertas e governanca (pausar/escalar/revisar com trilha de auditoria).
9. Hardening e go-live (observabilidade, backup, rotina de operacao).

## Status por passo (controle executivo)
| Passo | Status | Pronto em | O que ja esta pronto | O que falta | Previsao |
|---|---|---|---|---|---|
| 1. Fundacao tecnica | Concluido | 07/04/2026 | Repo `paulosramalho/Amanda` inicializado, backend Express ativo, deploy Render validado com `GET /health` retornando `ok: true`. | Nada deste passo. | Concluido |
| 2. Banco e Prisma | Concluido (deploy validado) | 08/04/2026 | Prisma 6.17.1 integrado (`@prisma/client` + `prisma`), schema criado, migration versionada em `backend/prisma/migrations`, scripts `prisma:generate`, `prisma:migrate:deploy`, `prisma:migrate:dev` e `postinstall` configurados, `start` aplicando migration automaticamente. Deploy em producao validado com DB reachable. | Nada deste passo. | Concluido |
| 3. Modelo de dados | Concluido (base) | 08/04/2026 | Modelos/tabelas implementados: `leads`, `campanhas_diarias`, `relatorios_semanais`, `jobs_execucao`; enums de status/fonte; indices e constraints iniciais. | Ajustes finos de colunas conforme integracao real dos canais de Ads. | 09/04/2026 |
| 4. Coleta automatica Ads | Em andamento (engine pronta) | 08/04/2026 | Job de coleta implementado (`adsCollectionJob`), providers Google/Meta implementados, scheduler interno em UTC configuravel, endpoints de execucao e consulta (`/jobs/ads-collection/*`, `/campaigns/daily`) e persistencia em `campanhas_diarias` + `jobs_execucao`. | Inserir credenciais reais de Ads, configurar API key do runner e agendar Cron externo no Render para chamar `POST /jobs/ads-collection/run`. | 08/04/2026 |
| 5. API de negocio | Em andamento (base) | 08/04/2026 | Endpoints base prontos: `/`, `/health`, `/health/db`, `/business-date`. Consulta inicial de dados diarios disponivel em `/campaigns/daily`. | Criar endpoints de dashboard e consolidacao com KPIs por periodo/canal. | 09/04/2026 |
| 6. Resumo semanal (agente) | Pendente | - | Escopo de resumo executivo definido. | Job semanal para gerar: o que funcionou, pausar, escalar. Persistir e disponibilizar via API. | 10/04/2026 |
| 7. Frontend dedicado | Em andamento (deploy inicial) | 08/04/2026 | Frontend Vite criado em `frontend/` e publicado na Vercel (confirmado). Tela inicial conectada ao backend via `VITE_API_BASE_URL`. | Dashboard operacional (filtros, comparativos, funil e historico). | 10/04/2026 |
| 8. Alertas e governanca | Pendente | - | Regras macro ja definidas. | Alertas de CPL/queda de conversao/gasto sem lead + trilha de decisao. | 11/04/2026 |
| 9. Go-live controlado | Pendente | - | Infra base pronta. | Checklist final, testes de ponta a ponta, rotina semanal operacional. | 11/04/2026 |

## Regra de atualizacao (a cada passo)
Sempre atualizar este documento com:
1. O que foi concluido e em qual data.
2. Evidencia (commit, endpoint, print/log, deploy).
3. O que falta do proximo passo.
4. Previsao objetiva da proxima entrega.

## Evidencias registradas
- Commit inicial do projeto: `b773382`.
- Deploy base Render validado com healthcheck em 08/04/2026.
- Estrutura Prisma e migration inicial criadas em `backend/prisma/`.
- Backend com verificador de DB: `GET /health/db`.
- Padrao de data de negocio implementado: `GET /business-date` retorna `YYYY-MM-DDT12:00:00-03:00`.
- Commit Passo 2/3 (Prisma + modelo base): `2c9312f`.
- Validacao em producao (08/04/2026): `/health` ok, `/health/db` com `db: reachable`, `/business-date` retornando `UTC-3 T12:00:00`.
- Frontend Vercel publicado (confirmado pelo deploy do projeto).
- Commit Passo 4 (coleta automatica Ads): 34c8522.
- Validacao em producao (08/04/2026): /jobs/ads-collection/config ok, POST /jobs/ads-collection/run ok (execucao de teste), /jobs/ads-collection/recent ok, /campaigns/daily ok.
