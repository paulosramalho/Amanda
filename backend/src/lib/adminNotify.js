import { Resend } from "resend";

function getResend() {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

function getAdminEmails() {
  const env = process.env.ADMIN_ALERT_EMAILS || "";
  return env.split(",").map((e) => e.trim()).filter(Boolean);
}

function getFrom() {
  return process.env.NOTIFY_EMAIL_FROM || "onboarding@resend.dev";
}

export async function sendAdminAlert({ subject, title, body, steps = [] }) {
  const stepsHtml = steps.length > 0
    ? `<h3 style="font-size:14px;color:#1e293b;margin:16px 0 8px;">Como corrigir:</h3>
       <ol style="font-size:13px;color:#334155;line-height:1.8;padding-left:20px;">
         ${steps.map((s) => `<li>${s}</li>`).join("")}
       </ol>`
    : "";

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0f172a;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
    <div style="font-size:18px;font-weight:700;">AMR Ads Control — Alerta Crítico</div>
  </div>
  <div style="background:white;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
    <div style="background:#fef2f2;border:1px solid #dc2626;border-radius:8px;padding:16px;margin-bottom:16px;">
      <strong style="color:#dc2626;">⚠️ ${title}</strong><br><br>
      <span style="font-size:13px;color:#1e293b;white-space:pre-wrap;">${body}</span>
    </div>
    ${stepsHtml}
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
      AMR Ads Control — alerta automático de erro crítico
    </div>
  </div>
</div>`;

  const results = {};

  // E-mail
  const resend = getResend();
  const to = getAdminEmails();
  if (resend && to.length) {
    try {
      const r = await resend.emails.send({ from: getFrom(), to, subject, html });
      results.email = { sent: true, to, id: r.data?.id };
    } catch (e) {
      console.error("[admin-notify] Email failed:", e.message);
      results.email = { sent: false, error: e.message };
    }
  } else {
    results.email = { skipped: true, reason: !resend ? "RESEND_API_KEY ausente" : "ADMIN_ALERT_EMAILS não configurado" };
  }

  // Telegram
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChatId = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChatId) {
    try {
      const stepsText = steps.length
        ? "\n\nComo corrigir:\n" + steps.map((s, i) => `${i + 1}. ${s.replace(/<[^>]*>/g, "")}`).join("\n")
        : "";
      const text = `AMR Ads Control\n\n${title}\n\n${body.replace(/<[^>]*>/g, "").slice(0, 300)}${stepsText}`;
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ chat_id: Number(tgChatId), text }),
        signal: AbortSignal.timeout(10000),
      });
      results.telegram = { sent: r.ok, status: r.status };
    } catch (e) {
      console.error("[admin-notify] Telegram failed:", e.message);
      results.telegram = { sent: false, error: e.message };
    }
  } else {
    results.telegram = { skipped: true, reason: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados" };
  }

  return results;
}
