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
| 1. Fundacao tecnica | Concluido | 07/04/2026 | Repo `paulosramalho/Amanda` inicializado (commit `b773382`), backend Express ativo, deploy Render validado com `GET /health` retornando `ok: true`. | Nada deste passo. | Concluido |
| 2. Banco e Prisma | Pendente | - | `DATABASE_URL` ja configurado no Render (informado). | Adicionar Prisma no backend, schema inicial, migration, generate e deploy com migration automatica. | 08/04/2026 |
| 3. Modelo de dados | Pendente | - | Estrutura minima do backend pronta para receber rotas. | Definir e criar tabelas: leads, campanhas_diarias, relatorios_semanais, jobs_execucao. | 08/04/2026 |
| 4. Coleta automatica Ads | Pendente | - | Cron Job ja existente no Render. | Integrar APIs Google Ads e Meta Ads; gravar consolidado diario no banco. | 09/04/2026 |
| 5. API de negocio | Pendente | - | Endpoints base (`/`, `/health`) prontos. | Criar endpoints de leads e dashboard com filtros por periodo/canal. | 09/04/2026 |
| 6. Resumo semanal (agente) | Pendente | - | Escopo de resumo executivo definido. | Job semanal para gerar: o que funcionou, pausar, escalar. Persistir e disponibilizar via API. | 10/04/2026 |
| 7. Frontend dedicado | Pendente | - | Vercel ja provisionado para o projeto. | Criar painel web e conectar no backend Render. | 10/04/2026 |
| 8. Alertas e governanca | Pendente | - | Regras macro ja definidas. | Alertas de CPL/queda de conversao/gasto sem lead + trilha de decisao. | 11/04/2026 |
| 9. Go-live controlado | Pendente | - | Infra base pronta. | Checklist final, testes de ponta a ponta, rotina semanal operacional. | 11/04/2026 |

## Regra de atualizacao (a cada passo)
Sempre atualizar este documento com:
1. O que foi concluido e em qual data.
2. Evidencia (commit, endpoint, print/log, deploy).
3. O que falta do proximo passo.
4. Previsao objetiva da proxima entrega.

## Evidencias ja registradas
- Commit inicial: `b773382`.
- Deploy base Render validado com resposta de healthcheck em 08/04/2026.
