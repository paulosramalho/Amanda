import { createReporter } from "./agentReporter.js";

export const reporter = createReporter({ projectSlug: "amanda" });

export const COCKPIT_AGENTS = [
  {
    name: "ads_collection",
    label: "Coletor de Anúncios",
    description: "Coleta diária de métricas Google Ads + Meta Ads.",
    schedule: "0 15 * * *",
    scheduleType: "cron",
  },
  {
    name: "weekly_report",
    label: "Relatório Semanal",
    description: "Gera e envia relatório semanal segunda-feira 09h BRT.",
    schedule: "0 12 * * 1",
    scheduleType: "cron",
  },
  {
    name: "instagram_full_cycle",
    label: "Instagram — Ciclo Diário",
    description: "Coleta posts + análise + sugestões + tendências (01h BRT).",
    schedule: "0 4 * * *",
    scheduleType: "cron",
  },
  {
    name: "post_publisher",
    label: "Publicador de Posts",
    description: "Publica posts agendados no Instagram (tick 5min).",
    schedule: "interval:300000",
    scheduleType: "interval",
  },
];
