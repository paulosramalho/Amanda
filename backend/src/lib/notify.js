import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function brl(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

function fmt(iso) {
  if (!iso) return "";
  const s = typeof iso === "string" ? iso : iso.toISOString();
  return s.slice(0, 10).split("-").reverse().join("/");
}

function getConfig() {
  return {
    to: process.env.NOTIFY_EMAIL_TO,
    from: process.env.NOTIFY_EMAIL_FROM || "onboarding@resend.dev",
  };
}

export async function sendWeeklyReportEmail(report) {
  if (!resend) return { skipped: true, reason: "RESEND_API_KEY not configured" };
  const { to, from } = getConfig();
  if (!to) return { skipped: true, reason: "NOTIFY_EMAIL_TO not configured" };

  const meta = report.recommendations?.summary || {};
  const items = report.recommendations?.items || [];
  const subject = `Relatório Semanal AMR Ads — ${fmt(report.weekStartDate)} a ${fmt(report.weekEndDate)}`;

  const itemsHtml = items.map((r) => {
    const colors = { alta: "#dc2626", média: "#d97706", info: "#2563eb" };
    const c = colors[r.priority] || "#64748b";
    return `<div style="border-left:3px solid ${c};padding:8px 12px;margin-bottom:8px;background:#f8fafc;border-radius:0 6px 6px 0;font-size:13px;">
      <strong style="color:${c};text-transform:uppercase;font-size:11px;">${r.priority}</strong> ${r.action}
    </div>`;
  }).join("");

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
  <div style="background:#0f172a;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
    <div style="font-size:18px;font-weight:700;">AMR Ads Control</div>
    <div style="color:#94a3b8;font-size:13px;margin-top:4px;">Relatório Semanal — ${fmt(report.weekStartDate)} a ${fmt(report.weekEndDate)}</div>
  </div>
  <div style="background:white;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
      ${[
        ["Gasto", brl(meta.spend)],
        ["Leads", meta.leads ?? 0],
        ["CPL", meta.cpl != null ? brl(meta.cpl) : "—"],
        meta.spendChangePct != null ? ["Gasto vs anterior", `${meta.spendChangePct > 0 ? "+" : ""}${meta.spendChangePct}%`] : null,
        meta.leadsChangePct != null ? ["Leads vs anterior", `${meta.leadsChangePct > 0 ? "+" : ""}${meta.leadsChangePct}%`] : null,
      ].filter(Boolean).map(([label, value]) =>
        `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;min-width:100px;">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">${label}</div>
          <div style="font-size:18px;font-weight:700;margin-top:2px;">${value}</div>
        </div>`
      ).join("")}
    </div>
    <h3 style="margin:0 0 8px;color:#059669;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">O que funcionou</h3>
    <pre style="font-family:sans-serif;font-size:13px;background:#f0fdf4;padding:12px;border-radius:8px;white-space:pre-wrap;margin:0 0 16px;">${report.whatWorked}</pre>
    <h3 style="margin:0 0 8px;color:#dc2626;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">Pausar / revisar</h3>
    <pre style="font-family:sans-serif;font-size:13px;background:#fef2f2;padding:12px;border-radius:8px;white-space:pre-wrap;margin:0 0 16px;">${report.whatToPause}</pre>
    <h3 style="margin:0 0 8px;color:#2563eb;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">Escalar</h3>
    <pre style="font-family:sans-serif;font-size:13px;background:#eff6ff;padding:12px;border-radius:8px;white-space:pre-wrap;margin:0 0 16px;">${report.whereToScale}</pre>
    ${items.length > 0 ? `<h3 style="margin:0 0 8px;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.06em;">Recomendações</h3>${itemsHtml}` : ""}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      AMR Ads Control — gerado automaticamente toda segunda-feira às 09h BRT
    </div>
  </div>
</div>`;

  try {
    const result = await resend.emails.send({ from, to, subject, html });
    return { sent: true, id: result.data?.id };
  } catch (err) {
    console.error("[notify] Weekly report email failed:", err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendAnomalyAlert(anomalies) {
  if (!resend) return { skipped: true, reason: "RESEND_API_KEY not configured" };
  const { to, from } = getConfig();
  if (!to) return { skipped: true, reason: "NOTIFY_EMAIL_TO not configured" };

  const subject = `Alerta AMR Ads — ${anomalies.length} anomalia${anomalies.length > 1 ? "s" : ""} detectada${anomalies.length > 1 ? "s" : ""}`;

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
  <div style="background:#0f172a;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
    <div style="font-size:18px;font-weight:700;">AMR Ads Control</div>
    <div style="color:#fdba74;font-size:13px;margin-top:4px;">Alerta de anomalia detectada</div>
  </div>
  <div style="background:white;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
    ${anomalies.map((a) => `<div style="background:#fff7ed;border:1px solid #fdba74;border-left:4px solid #ea580c;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:12px;">
      <div style="font-weight:700;color:#9a3412;font-size:14px;">${a.type}</div>
      <div style="color:#92400e;font-size:13px;margin-top:4px;">${a.message}</div>
    </div>`).join("")}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      AMR Ads Control — monitoramento automático diário
    </div>
  </div>
</div>`;

  try {
    const result = await resend.emails.send({ from, to, subject, html });
    return { sent: true, id: result.data?.id };
  } catch (err) {
    console.error("[notify] Anomaly alert email failed:", err.message);
    return { sent: false, error: err.message };
  }
}
