# Amanda Ads App

MVP para monitoramento de Google Ads, Meta Ads e Instagram Ads.

## Estrutura
- `backend/`: API Node.js (Express + Prisma), deploy no Render.
- `frontend/`: app Vite + React, deploy na Vercel.
- `docs/PLANO_STATUS.md`: plano geral de implantacao e status por passo.

## Endpoints backend
- `GET /`
- `GET /health`
- `GET /health/db`
- `GET /business-date`
- `GET /jobs/ads-collection/config`
- `POST /jobs/ads-collection/run`
- `GET /jobs/ads-collection/recent`
- `GET /campaigns/daily`

## Coleta automatica Ads
- Providers implementados:
  - Google Ads (`backend/src/jobs/ads/providers/googleAds.js`)
  - Meta Ads / Instagram Ads (`backend/src/jobs/ads/providers/metaAds.js`)
- Job central: `backend/src/jobs/adsCollectionJob.js`
- Scheduler interno: `backend/src/jobs/adsScheduler.js`
- Registro de execucao em `jobs_execucao`
- Persistencia diaria em `campanhas_diarias`
- Google Ads OAuth recomendado:
  - `GOOGLE_ADS_CLIENT_ID`
  - `GOOGLE_ADS_CLIENT_SECRET`
  - `GOOGLE_ADS_REFRESH_TOKEN`
  - o backend gera `access_token` automaticamente em runtime

## Deploy backend (Render)
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm run start`

## Deploy frontend (Vercel)
- Framework: `Vite`
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
- Env var: `VITE_API_BASE_URL=https://amanda-api.onrender.com`

## Banco de dados (Neon + Prisma)
- Prisma schema: `backend/prisma/schema.prisma`
- Migration inicial: `backend/prisma/migrations/20260408023000_init/migration.sql`
- Scripts:
  - `npm run prisma:generate`
  - `npm run prisma:migrate:dev`
  - `npm run prisma:migrate:deploy`

## Variaveis de ambiente
- Backend: usar `backend/.env.example`
- Frontend: usar `frontend/.env.example`

## Regra de datas de negocio
- Usar sempre `UTC-3 T12:00:00` (`YYYY-MM-DDT12:00:00-03:00`).
