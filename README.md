# Amanda Ads App

MVP inicial para monitoramento de Google Ads, Meta Ads e Instagram Ads.

## Estrutura
- `backend/`: API Node.js (Express), pronta para deploy no Render.
- `docs/PLANO_STATUS.md`: plano geral de implantacao e status por passo.

## Endpoints iniciais
- `GET /health`
- `GET /`

## Deploy (Render)
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm run start`

## Variaveis de ambiente
Use `backend/.env.example` como base.

## Regra de datas de negocio
- Usar sempre `UTC-3 T12:00:00` (`YYYY-MM-DDT12:00:00-03:00`).
