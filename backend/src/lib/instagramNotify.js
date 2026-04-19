import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const ACTION_COLOR = { INVEST: "#059669", REDIRECT: "#d97706", REMOVE: "#dc2626", MONITOR: "#2563eb", MAINTAIN: "#64748b" };
const ACTION_LABEL = { INVEST: "Investir mais", REDIRECT: "Redirecionar", REMOVE: "Remover", MONITOR: "Monitorar", MAINTAIN: "Manter" };

function fmt(iso) {
  if (!iso) return "";
  const s = typeof iso === "string" ? iso : new Date(iso).toISOString();
  return s.slice(0, 10).split("-").reverse().join("/");
}

function getRecipients() {
  const env = process.env.INSTAGRAM_NOTIFY_EMAILS || process.env.NOTIFY_EMAIL_TO || "";
  return env.split(",").map((e) => e.trim()).filter(Boolean);
}

function getFrom() {
  return process.env.NOTIFY_EMAIL_FROM || "onboarding@resend.dev";
}

function postCard(post, analysis, simulated = false) {
  const color = ACTION_COLOR[analysis.action];
  const label = ACTION_LABEL[analysis.action];
  const caption = post.caption ? post.caption.slice(0, 140) + (post.caption.length > 140 ? "…" : "") : "(sem legenda)";
  const simulatedBadge = simulated
    ? `<span style="background:#fef9c3;color:#713f12;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:6px;">SIMULADO</span>`
    : "";

  return `
  <div style="border:1px solid #e2e8f0;border-left:4px solid ${color};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:12px;background:#fff;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="background:${color}22;color:${color};font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;text-transform:uppercase;">${label}</span>
      <span style="font-size:11px;color:#64748b;">Score ${analysis.score}/10</span>
      ${simulatedBadge}
      <span style="font-size:11px;color:#94a3b8;margin-left:auto;">${fmt(post.publishedAt)}</span>
    </div>
    <p style="font-size:13px;color:#1e293b;margin:0 0 8px;line-height:1.5;">${caption}</p>
    <div style="display:flex;gap:16px;font-size:12px;color:#64748b;margin-bottom:8px;">
      <span>❤️ ${(post.likeCount || 0).toLocaleString("pt-BR")} curtidas</span>
      <span>💬 ${(post.commentsCount || 0).toLocaleString("pt-BR")} comentários</span>
      ${post.reach ? `<span>👁 ${post.reach.toLocaleString("pt-BR")} alcance</span>` : ""}
    </div>
    <p style="font-size:12px;color:#475569;font-style:italic;margin:0 0 8px;">"${analysis.reasoning}"</p>
    ${post.permalink ? `<a href="${post.permalink}" style="font-size:12px;color:#2563eb;">Ver no Instagram →</a>` : ""}
  </div>`;
}

function tokenRenewalBanner(daysUsed) {
  if (daysUsed < 45) return "";
  const isUrgent = daysUsed >= 55;
  const bg = isUrgent ? "#fef2f2" : "#fff7ed";
  const border = isUrgent ? "#dc2626" : "#d97706";
  const text = isUrgent
    ? `⚠️ <strong>Token expira em breve!</strong> Ele foi gerado há ${daysUsed} dias e expira em ~60 dias. Renove agora no <a href="https://developers.facebook.com/tools/explorer/" style="color:${border};">Graph API Explorer</a>.`
    : `🔔 Token gerado há ${daysUsed} dias — renove em até ${60 - daysUsed} dias para não interromper a coleta.`;
  return `
  <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#1e293b;">
    ${text}
  </div>`;
}

export async function sendInstagramAnalysisEmail({ investPosts = [], removePosts = [], tokenDaysUsed = null, simulated = false }) {
  if (!resend) return { skipped: true, reason: "RESEND_API_KEY not configured" };
  const to = getRecipients();
  if (!to.length) return { skipped: true, reason: "INSTAGRAM_NOTIFY_EMAILS not configured" };

  const total = investPosts.length + removePosts.length;
  const subject = `AMR Ads — ${total} post${total !== 1 ? "s" : ""} precisam de atenção @amandamramalho${simulated ? " (teste)" : ""}`;

  const investSection = investPosts.length > 0 ? `
    <h3 style="margin:20px 0 8px;color:${ACTION_COLOR.INVEST};font-size:12px;text-transform:uppercase;letter-spacing:.06em;">
      Investir mais (${investPosts.length})
    </h3>
    ${investPosts.map((p) => postCard(p.post, p.analysis, p.simulated)).join("")}` : "";

  const removeSection = removePosts.length > 0 ? `
    <h3 style="margin:20px 0 8px;color:${ACTION_COLOR.REMOVE};font-size:12px;text-transform:uppercase;letter-spacing:.06em;">
      Remover (${removePosts.length})
    </h3>
    ${removePosts.map((p) => postCard(p.post, p.analysis, p.simulated)).join("")}` : "";

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
  <div style="background:#0f172a;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
    <div style="font-size:18px;font-weight:700;">AMR Ads Control</div>
    <div style="color:#94a3b8;font-size:13px;margin-top:4px;">Análise de Conteúdo — @amandamramalho</div>
  </div>
  <div style="background:white;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
    ${tokenDaysUsed != null ? tokenRenewalBanner(tokenDaysUsed) : ""}
    ${investSection}
    ${removeSection}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      AMR Ads Control — análise automática diária via Claude AI
    </div>
  </div>
</div>`;

  try {
    const result = await resend.emails.send({ from: getFrom(), to, subject, html });
    return { sent: true, to, id: result.data?.id };
  } catch (err) {
    console.error("[instagram-notify] Email failed:", err.message);
    return { sent: false, error: err.message };
  }
}

export function getTokenDaysUsed() {
  const issued = process.env.INSTAGRAM_TOKEN_ISSUED_DATE;
  if (!issued) return null;
  const days = Math.floor((Date.now() - new Date(issued).getTime()) / 86400000);
  return days >= 0 ? days : null;
}
