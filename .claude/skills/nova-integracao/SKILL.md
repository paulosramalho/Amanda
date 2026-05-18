---
name: nova-integracao
description: Scaffold de nova integração com API externa para o projeto Amanda (Google, Meta, Instagram, etc.). Segue o padrão de providers com enable flag, paginação e normalização. Argumentos: $1 = nome em camelCase (ex: tiktokAds), $2 = plataforma (ex: TikTok Ads), $3 = descrição (ex: "coleta métricas de campanhas TikTok").
argument-hint: [nomePlatforma] [NomePlataforma] [descrição]
---

# Scaffold — Nova Integração de API (Amanda)

Crie o arquivo `backend/src/jobs/ads/providers/$1.js` com o scaffold abaixo para "$3":

## Arquivo: backend/src/jobs/ads/providers/$1.js

```javascript
const PLATFORM = "$2";

// ── Helpers de conversão robusta ──────────────────────────────────────────────
function toBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function toInteger(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value) {
  const parsed = Number(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Paginação automática ──────────────────────────────────────────────────────
async function fetchAllPages(url, options = {}) {
  const rows = [];
  let nextUrl = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, { method: "GET", ...options });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`${PLATFORM} request failed (${response.status}): ${errorBody.slice(0, 300)}`);
    }

    const payload = await response.json();
    rows.push(...(payload.data || payload.items || []));
    nextUrl = payload.paging?.next || payload.nextPageToken || null;
  }

  return rows;
}

/**
 * collect$1Metrics — $3
 * @param {{ dateOnly: string }} params  — data no formato YYYY-MM-DD
 * @returns {Promise<Array>}             — array de métricas normalizadas
 */
export async function collect$1Metrics({ dateOnly }) {
  const enabled = toBoolean(process.env.$2_ENABLED, false);
  if (!enabled) return [];

  const accessToken = process.env.$2_ACCESS_TOKEN;
  const accountId   = process.env.$2_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    console.warn(`[$1] Credenciais não configuradas ($2_ACCESS_TOKEN, $2_ACCOUNT_ID).`);
    return [];
  }

  // ── Montar URL da API ─────────────────────────────────────────────────────
  const params = new URLSearchParams({
    access_token: accessToken,
    // parâmetros específicos da API (datas, campos, etc.)
    time_range: JSON.stringify({ since: dateOnly, until: dateOnly }),
    fields: "campo1,campo2,campo3",
  });

  const url = `https://api.PLATAFORMA.com/v1/ENDPOINT/${accountId}/insights?${params}`;
  const rows = await fetchAllPages(url);

  // ── Normalizar para o schema da Amanda ────────────────────────────────────
  return rows.map(row => ({
    platform:     PLATFORM,
    campaignId:   String(row.id || ""),
    campaignName: String(row.name || ""),
    date:         dateOnly,
    impressions:  toInteger(row.impressions),
    clicks:       toInteger(row.clicks),
    spend:        toNumber(row.spend),        // valor em reais (não centavos — é gasto de anúncio)
    leads:        toInteger(row.leads || 0),
    reach:        toInteger(row.reach  || 0),
  }));
}
```

## Env vars necessárias

Adicionar ao `.env` e documentar em `.env.example`:

```env
# $2
$2_ENABLED=false
$2_ACCESS_TOKEN=
$2_ACCOUNT_ID=
```

## Integrar no adsCollectionJob.js

```javascript
import { collect$1Metrics } from "./ads/providers/$1.js";

// Dentro de runAdsCollectionJob():
const [$1Results] = await Promise.allSettled([
  collect$1Metrics({ dateOnly }),
  // ...outras plataformas
]);

if ($1Results.status === "fulfilled") {
  allMetrics.push(...$1Results.value);
}
```

## Persistir no banco

Verificar se o modelo `Campaign` ou `AdMetric` no Prisma já suporta a nova plataforma:
- Se `platform` é um campo livre (String) → sem migration necessária
- Se `platform` é um enum → adicionar `$2` ao enum e rodar `/nova-migration`

## Checklist

- [ ] Substituir a URL e parâmetros da API pela documentação real da plataforma
- [ ] Adaptar o mapeamento de campos em `rows.map()`
- [ ] Adicionar env vars ao `.env` e `.env.example`
- [ ] Integrar em `adsCollectionJob.js`
- [ ] Verificar se schema Prisma precisa de migration
- [ ] Testar com `$2_ENABLED=true` localmente
- [ ] Commit + push
