# Amanda Ads App

MVP para monitoramento de Google Ads, Meta Ads e Instagram Ads.

## Estrutura
- `backend/`: API Node.js (Express + Prisma), pronta para deploy no Render.
- `docs/PLANO_STATUS.md`: plano geral de implantacao e status por passo.

## Endpoints atuais
- `GET /`
- `GET /health`
- `GET /health/db`
- `GET /business-date`

## Deploy (Render)
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm run start`

## Banco de dados (Neon + Prisma)
- Prisma schema: `backend/prisma/schema.prisma`
- Migration inicial: `backend/prisma/migrations/20260408023000_init/migration.sql`
- Scripts:
  - `npm run prisma:generate`
  - `npm run prisma:migrate:dev`
  - `npm run prisma:migrate:deploy`

## Variaveis de ambiente
Use `backend/.env.example` como base.

## Regra de datas de negocio
- Usar sempre `UTC-3 T12:00:00` (`YYYY-MM-DDT12:00:00-03:00`).
