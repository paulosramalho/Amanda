import { useEffect, useState, useCallback, useRef } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import "./App.css";

const API = import.meta.env.VITE_API_BASE_URL || "https://amanda-api.onrender.com";

function getToken() { return localStorage.getItem("amr_token"); }
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem("amr_token");
    sessionStorage.setItem("amr_session_msg", "Desconectado por inatividade.");
    window.location.reload();
    throw new Error("unauthenticated");
  }
  return res;
}

const PERIODS = [
  { label: "7 dias", value: 7 },
  { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 },
];

const ACTION_LABEL = { INVEST: "Investir mais", REDIRECT: "Redirecionar", REMOVE: "Remover", MONITOR: "Monitorar", MAINTAIN: "Manter" };
const ACTION_COLOR = { INVEST: "#059669", REDIRECT: "#d97706", REMOVE: "#dc2626", MONITOR: "#2563eb", MAINTAIN: "#64748b" };

const PLATFORM_LABEL = { GOOGLE_ADS: "Google Ads", META_ADS: "Meta Ads" };
const PLATFORM_COLOR = { GOOGLE_ADS: "#1d4ed8", META_ADS: "#7c3aed" };

const SOURCE_LABEL = {
  GOOGLE_ADS: "Google Ads", META_ADS: "Meta Ads", INSTAGRAM_ADS: "Instagram",
  ORGANIC: "Orgânico", REFERRAL: "Indicação", SITE: "Site", OTHER: "Outro",
};

const STATUS_LABEL = {
  NEW: "Novo", CONTACTED: "Contactado", QUALIFIED: "Qualificado",
  WON: "Convertido", LOST: "Perdido", ARCHIVED: "Arquivado",
};

const STATUS_COLOR = {
  NEW: "#2563eb", CONTACTED: "#d97706", QUALIFIED: "#7c3aed",
  WON: "#059669", LOST: "#dc2626", ARCHIVED: "#94a3b8",
};

function brl(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

function pct(v) {
  if (v == null) return "—";
  return `${((v) * 100).toFixed(2)}%`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtDateFull(iso) {
  if (!iso) return "";
  const s = typeof iso === "string" ? iso : new Date(iso).toISOString();
  return s.slice(0, 10).split("-").reverse().join("/");
}

function fmtDatetime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Belem", dateStyle: "short", timeStyle: "short" });
}

function currentMonth() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Belem" }).slice(0, 7).replace("/", "-");
}

// ── Small components ─────────────────────────────────────────────────────────

function KPICard({ label, value, sub, highlight }) {
  return (
    <div className={`kpi-card${highlight ? " kpi-highlight" : ""}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function AlertBanner({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <div className="alert-banner">
      {alerts.map((a, i) => (
        <div key={i} className="alert-item">
          <span className="alert-dot" /> {a.message}
        </div>
      ))}
    </div>
  );
}

function PlatformCard({ platform, data }) {
  return (
    <div className="platform-card" style={{ borderTopColor: PLATFORM_COLOR[platform] }}>
      <span className="platform-name" style={{ color: PLATFORM_COLOR[platform] }}>
        {PLATFORM_LABEL[platform] || platform}
      </span>
      <div className="platform-stats">
        <div><span>Gasto</span><strong>{brl(data.spend)}</strong></div>
        <div><span>Leads</span><strong>{data.leads}</strong></div>
        <div><span>CPL</span><strong>{data.cpl != null ? brl(data.cpl) : "—"}</strong></div>
        <div><span>Cliques</span><strong>{data.clicks.toLocaleString("pt-BR")}</strong></div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">{fmtDate(label)}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name === "Gasto" ? brl(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

// ── Monthly Goal ──────────────────────────────────────────────────────────────

function GoalBar({ label, current, goal, color }) {
  if (!goal) return null;
  const pctVal = Math.min(100, (current / goal) * 100);
  return (
    <div className="goal-bar-item">
      <div className="goal-bar-header">
        <span className="goal-bar-label">{label}</span>
        <span className="goal-bar-values">
          {typeof current === "number" && label.includes("R$")
            ? `${brl(current)} / ${brl(goal)}`
            : `${current} / ${goal}`}
          <span className="goal-bar-pct"> ({pctVal.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="goal-bar-track">
        <div
          className="goal-bar-fill"
          style={{ width: `${pctVal}%`, background: pctVal >= 100 ? "#059669" : color }}
        />
      </div>
    </div>
  );
}

function MonthlyGoalSection({ goal, totals, onEdit }) {
  if (!goal || (!goal.spendGoal && !goal.leadsGoal)) {
    return (
      <div className="goal-empty">
        <span>Nenhuma meta definida para este mês.</span>
        <button className="goal-edit-btn" onClick={onEdit} type="button">Definir meta</button>
      </div>
    );
  }
  return (
    <div className="goal-section">
      <div className="goal-section-header">
        <span className="section-label">Meta do Mês</span>
        <button className="goal-edit-btn" onClick={onEdit} type="button">Editar</button>
      </div>
      {goal.spendGoal && (
        <GoalBar label="Gasto (R$)" current={totals?.spend ?? 0} goal={parseFloat(goal.spendGoal)} color="#ea580c" />
      )}
      {goal.leadsGoal && (
        <GoalBar label="Leads" current={totals?.leads ?? 0} goal={goal.leadsGoal} color="#10b981" />
      )}
    </div>
  );
}

function GoalEditorModal({ month, goal, onSave, onClose }) {
  const [spendGoal, setSpendGoal] = useState(goal?.spendGoal ? String(parseFloat(goal.spendGoal)) : "");
  const [leadsGoal, setLeadsGoal] = useState(goal?.leadsGoal ? String(goal.leadsGoal) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      month,
      spendGoal: spendGoal ? parseFloat(spendGoal) : null,
      leadsGoal: leadsGoal ? parseInt(leadsGoal, 10) : null,
    });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Meta do Mês — {month}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="form-label">Meta de gasto (R$)</label>
          <input className="form-input" type="number" min="0" step="0.01" value={spendGoal}
            onChange={(e) => setSpendGoal(e.target.value)} placeholder="Ex: 3000.00" />
          <label className="form-label" style={{ marginTop: 12 }}>Meta de leads</label>
          <input className="form-input" type="number" min="0" step="1" value={leadsGoal}
            onChange={(e) => setLeadsGoal(e.target.value)} placeholder="Ex: 20" />
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} type="button">Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} type="button">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Campaign Detail Modal ─────────────────────────────────────────────────────

function CampaignDetailModal({ campaign, days, onClose }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const encoded = encodeURIComponent(campaign.campaignId);
    fetch(`${API}/dashboard/campaigns/${campaign.platform}/${encoded}/daily?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setSeries(d.series || []); })
      .finally(() => setLoading(false));
  }, [campaign, days]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{campaign.campaignName || campaign.campaignId}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <span className="plat-badge" style={{ background: PLATFORM_COLOR[campaign.platform] + "22", color: PLATFORM_COLOR[campaign.platform] }}>
            {PLATFORM_LABEL[campaign.platform] || campaign.platform}
          </span>
          <div style={{ marginTop: 16 }}>
            {loading ? (
              <div className="empty-chart">Carregando…</div>
            ) : series.length === 0 ? (
              <div className="empty-chart">Sem dados para o período.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={series} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis yAxisId="spend" tickFormatter={(v) => `R$${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} tick={{ fontSize: 10, fill: "#64748b" }} width={76} />
                  <YAxis yAxisId="leads" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} width={32} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar yAxisId="leads" dataKey="leads" name="Leads" fill="#10b981" opacity={0.85} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="spend" dataKey="spend" name="Gasto" stroke="#ea580c" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Weekly Report ─────────────────────────────────────────────────────────────

function WeeklyReportSection({ reports }) {
  const [idx, setIdx] = useState(0);
  if (!reports?.length) return (
    <div className="empty-chart" style={{ height: 80 }}>Nenhum relatório semanal gerado ainda.</div>
  );

  const report = reports[idx];
  const meta = report.recommendations?.summary || {};
  const items = report.recommendations?.items || [];
  const priorityColor = { alta: "#dc2626", média: "#d97706", info: "#2563eb" };

  return (
    <section className="weekly-report-section">
      <div className="wr-nav">
        <h2 className="section-title" style={{ margin: 0 }}>
          {fmtDateFull(report.weekStartDate)} a {fmtDateFull(report.weekEndDate)}
        </h2>
        <div className="wr-nav-btns">
          <button className="wr-nav-btn" disabled={idx >= reports.length - 1} onClick={() => setIdx(i => i + 1)} type="button">‹ Anterior</button>
          <span className="wr-nav-count">{idx + 1} / {reports.length}</span>
          <button className="wr-nav-btn" disabled={idx === 0} onClick={() => setIdx(i => i - 1)} type="button">Próxima ›</button>
        </div>
      </div>

      <div className="wr-meta">
        <span>Gasto: <strong>{brl(meta.spend ?? 0)}</strong></span>
        <span>Leads: <strong>{meta.leads ?? 0}</strong></span>
        <span>CPL: <strong>{meta.cpl != null ? brl(meta.cpl) : "—"}</strong></span>
        {meta.spendChangePct != null && (
          <span className={meta.spendChangePct > 0 ? "wr-up" : "wr-down"}>
            Gasto {meta.spendChangePct > 0 ? "+" : ""}{meta.spendChangePct}% vs semana anterior
          </span>
        )}
        {meta.leadsChangePct != null && (
          <span className={meta.leadsChangePct > 0 ? "wr-up" : "wr-down"}>
            Leads {meta.leadsChangePct > 0 ? "+" : ""}{meta.leadsChangePct}% vs semana anterior
          </span>
        )}
      </div>

      <div className="wr-grid">
        <div className="wr-block">
          <h3 className="wr-block-title wr-green">O que funcionou</h3>
          <pre className="wr-text">{report.whatWorked || "—"}</pre>
        </div>
        <div className="wr-block">
          <h3 className="wr-block-title wr-red">Pausar / revisar</h3>
          <pre className="wr-text">{report.whatToPause || "—"}</pre>
        </div>
        <div className="wr-block">
          <h3 className="wr-block-title wr-blue">Escalar</h3>
          <pre className="wr-text">{report.whereToScale || "—"}</pre>
        </div>
      </div>

      {items.length > 0 && (
        <div className="wr-recs">
          <h3 className="wr-block-title">Recomendações</h3>
          {items.map((r, i) => (
            <div key={i} className="wr-rec-item" style={{ borderLeftColor: priorityColor[r.priority] || "#94a3b8" }}>
              <span className="wr-rec-priority" style={{ color: priorityColor[r.priority] || "#94a3b8" }}>{r.priority?.toUpperCase()}</span>
              <span>{r.action}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Leads Tab ─────────────────────────────────────────────────────────────────

function parseLeadNotes(notes) {
  if (!notes) return { urgencia: null, mensagem: null };
  const lines = notes.split("\n");
  const urgLine = lines.find((l) => l.startsWith("Urgência: "));
  const urgencia = urgLine ? urgLine.replace("Urgência: ", "") : null;
  const mensagem = lines.filter((l) => !l.startsWith("Área: ") && !l.startsWith("Urgência: ")).join(" ") || null;
  return { urgencia, mensagem: mensagem || null };
}

function LeadsTab({ leads, onCreated, onStatusChange }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", companyName: "", source: "OTHER", campaignName: "", notes: "", monthlyFeePotential: "" });
  const [saving, setSaving] = useState(false);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch(`/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          monthlyFeePotential: form.monthlyFeePotential ? parseFloat(form.monthlyFeePotential) : null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onCreated(data.lead);
        setForm({ name: "", phone: "", email: "", companyName: "", source: "OTHER", campaignName: "", notes: "", monthlyFeePotential: "" });
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="leads-tab">
      <div className="leads-header">
        <h2 className="section-title" style={{ margin: 0 }}>Leads ({leads.length})</h2>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)} type="button">
          {showForm ? "Cancelar" : "+ Novo Lead"}
        </button>
      </div>

      {showForm && (
        <form className="lead-form" onSubmit={handleSubmit}>
          <div className="lead-form-grid">
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-input" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="email@empresa.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Empresa</label>
              <input className="form-input" value={form.companyName} onChange={(e) => setField("companyName", e.target.value)} placeholder="Nome da empresa" />
            </div>
            <div className="form-group">
              <label className="form-label">Origem</label>
              <select className="form-input" value={form.source} onChange={(e) => setField("source", e.target.value)}>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Campanha</label>
              <input className="form-input" value={form.campaignName} onChange={(e) => setField("campaignName", e.target.value)} placeholder="Nome da campanha" />
            </div>
            <div className="form-group">
              <label className="form-label">Fee mensal potencial (R$)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.monthlyFeePotential} onChange={(e) => setField("monthlyFeePotential", e.target.value)} placeholder="Ex: 2500.00" />
            </div>
            <div className="form-group lead-form-notes">
              <label className="form-label">Observações</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Anotações sobre o lead…" />
            </div>
          </div>
          <div className="lead-form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar Lead"}</button>
          </div>
        </form>
      )}

      {leads.length === 0 ? (
        <div className="empty-chart">Nenhum lead registrado ainda.</div>
      ) : (
        <div className="table-wrap">
          <table className="camp-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Urgência</th>
                <th>Origem</th>
                <th>Campanha</th>
                <th>Necessidade</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const { urgencia, mensagem } = parseLeadNotes(lead.notes);
                return (
                <tr key={lead.id}>
                  <td className="camp-name">{lead.name || "—"}</td>
                  <td>{lead.email || "—"}</td>
                  <td>{lead.phone || "—"}</td>
                  <td>{urgencia || "—"}</td>
                  <td>
                    <span className="plat-badge" style={{ background: "#f1f5f9", color: "#475569" }}>
                      {SOURCE_LABEL[lead.source] || lead.source}
                    </span>
                  </td>
                  <td>{lead.campaignName || "—"}</td>
                  <td title={mensagem || ""}>{mensagem ? mensagem.slice(0, 60) + (mensagem.length > 60 ? "…" : "") : "—"}</td>
                  <td>
                    <select
                      className="status-select"
                      value={lead.status}
                      style={{ color: STATUS_COLOR[lead.status] }}
                      onChange={(e) => onStatusChange(lead.id, e.target.value)}
                    >
                      {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>{fmtDateFull(lead.businessDate)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Instagram Tab ────────────────────────────────────────────────────────────

function MediaTypeBadge({ type }) {
  const map = { IMAGE: "Foto", VIDEO: "Vídeo", CAROUSEL_ALBUM: "Carrossel", REELS: "Reel" };
  return <span className="plat-badge" style={{ background: "#f1f5f9", color: "#475569" }}>{map[type] || type}</span>;
}

function ActionBadge({ action }) {
  if (!action) return <span className="plat-badge" style={{ background: "#f1f5f9", color: "#94a3b8" }}>—</span>;
  return (
    <span className="plat-badge" style={{ background: ACTION_COLOR[action] + "22", color: ACTION_COLOR[action], fontWeight: 600 }}>
      {ACTION_LABEL[action] || action}
    </span>
  );
}

function ScoreDots({ score }) {
  return (
    <span className="score-dots" title={`${score}/10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="score-dot" style={{ background: i < score ? ACTION_COLOR.INVEST : "#e2e8f0" }} />
      ))}
    </span>
  );
}

const FORMAT_LABEL = { POST: "Post", CAROUSEL: "Carrossel", STORIES: "Stories", REEL: "Reel" };
const FORMAT_COLOR = { POST: "#2563eb", CAROUSEL: "#7c3aed", STORIES: "#db2777", REEL: "#ea580c" };
const SUGGESTION_STATUS_LABEL = { PENDING: "Pendente", DONE: "Feito", DISMISSED: "Descartado" };
const SUGGESTION_STATUS_COLOR = { PENDING: "#2563eb", DONE: "#059669", DISMISSED: "#94a3b8" };

const SCHEDULED_STATUS_LABEL = { DRAFT: "Rascunho", SCHEDULED: "Agendado", PUBLISHING: "Publicando…", PUBLISHED: "Publicado", FAILED: "Falhou", CANCELLED: "Cancelado" };
const SCHEDULED_STATUS_COLOR = { DRAFT: "#94a3b8", SCHEDULED: "#2563eb", PUBLISHING: "#d97706", PUBLISHED: "#059669", FAILED: "#dc2626", CANCELLED: "#94a3b8" };
const PUBLISH_FORMAT_LABEL  = { PHOTO: "Foto", CAROUSEL: "Carrossel", REEL: "Reel", STORY: "Stories" };
const SUGGESTION_TO_PUBLISH = { POST: "PHOTO", CAROUSEL: "CAROUSEL", STORIES: "STORY", REEL: "REEL" };
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const FORMAT_ICON = { PHOTO: "📷", CAROUSEL: "🖼️", REEL: "🎬", STORY: "✨" };

function ScheduledPostBadge({ post }) {
  if (!post) return null;
  const label = SCHEDULED_STATUS_LABEL[post.status] || post.status;
  const color = SCHEDULED_STATUS_COLOR[post.status] || "#64748b";
  const when = post.status === "PUBLISHED" && post.publishedAt
    ? fmtDatetime(post.publishedAt)
    : post.scheduledFor ? fmtDatetime(post.scheduledFor) : "";
  return (
    <span className="plat-badge" style={{ background: color + "22", color, fontWeight: 600 }} title={post.errorMessage || ""}>
      {label}{when ? ` · ${when}` : ""}{post.igPermalink ? <> · <a href={post.igPermalink} target="_blank" rel="noreferrer" style={{ color }}>ver</a></> : null}
    </span>
  );
}

// Default: amanhã às 09:00 BRT
function defaultScheduledLocal() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const ymd = tomorrow.toLocaleDateString("sv-SE", { timeZone: "America/Belem" });
  return { date: ymd, time: "09:00" };
}

// BRT (UTC-3) → ISO UTC. date "YYYY-MM-DD" + time "HH:MM" → "...Z"
function brtToUtcIso(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // BRT está 3h atrás de UTC; somar 3h para ir pra UTC.
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0)).toISOString();
}

const IG_MEDIA_TO_PUBLISH = { IMAGE: "PHOTO", CAROUSEL_ALBUM: "CAROUSEL", VIDEO: "REEL", REELS: "REEL" };

function SchedulePostModal({ suggestion, existing, recycleFrom, defaultDate, onClose, onSubmit, onCancel }) {
  const initial = existing || {};
  const def = defaultScheduledLocal();
  const startDate = initial.scheduledFor
    ? new Date(initial.scheduledFor).toLocaleDateString("sv-SE", { timeZone: "America/Belem" })
    : (defaultDate || def.date);
  const startTime = initial.scheduledFor
    ? new Date(initial.scheduledFor).toLocaleTimeString("pt-BR", { timeZone: "America/Belem", hour12: false }).slice(0, 5)
    : def.time;
  const initialFormat = initial.format
    || (suggestion ? SUGGESTION_TO_PUBLISH[suggestion.format] : null)
    || (recycleFrom ? IG_MEDIA_TO_PUBLISH[recycleFrom.mediaType] : null)
    || "PHOTO";

  const [format, setFormat] = useState(initialFormat);
  const [caption, setCaption] = useState(
    initial.caption
    ?? (recycleFrom?.caption ?? "")
    ?? (suggestion ? suggestion.theme : "")
    ?? ""
  );
  const [mediaUrls, setMediaUrls] = useState(initial.mediaUrls?.length ? initial.mediaUrls : [""]);
  const [date, setDate] = useState(startDate);
  const [time, setTime] = useState(startTime);
  const [firstComment, setFirstComment] = useState(initial.firstComment || "");
  const [submitting, setSubmitting] = useState(false);
  const [suggestingHashtags, setSuggestingHashtags] = useState(false);
  const [bestTime, setBestTime] = useState(null); // { recommendations, period, totalPosts, message? }
  const [loadingBestTime, setLoadingBestTime] = useState(false);
  const [err, setErr] = useState(null);

  const fase2 = format === "STORY";

  async function loadBestTime() {
    setLoadingBestTime(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/best-time/instagram?days=90");
      const d = await res.json();
      setBestTime(d.ok ? d : { recommendations: [], message: d.message });
    } catch (e) {
      setErr("Falha ao carregar histórico: " + (e.message || "erro"));
    } finally {
      setLoadingBestTime(false);
    }
  }

  // Próxima ocorrência do dia da semana (0-6) a partir de uma data BRT base
  function nextDateForDayOfWeek(targetDay) {
    const todayBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Belem" }));
    const todayDay = todayBRT.getDay();
    const diff = ((targetDay - todayDay) + 7) % 7 || 7; // se for hoje, vai para próxima semana
    const target = new Date(todayBRT.getTime() + diff * 86400000);
    return target.toLocaleDateString("sv-SE", { timeZone: "America/Belem" });
  }

  function applyRecommendation(rec) {
    setDate(nextDateForDayOfWeek(rec.day));
    setTime(`${String(rec.hour).padStart(2, "0")}:00`);
    setBestTime(null);
  }

  async function suggestHashtags() {
    if (!caption.trim()) {
      setErr("Escreva a legenda primeiro para gerar hashtags relevantes.");
      return;
    }
    setSuggestingHashtags(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/hashtags/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, count: 10 }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.message || "Falha");
      const tags = d.hashtags.join(" ");
      setFirstComment((cur) => cur ? `${cur}\n${tags}` : tags);
    } catch (e) {
      setErr("Falha ao gerar hashtags: " + (e.message || "erro desconhecido"));
    } finally {
      setSuggestingHashtags(false);
    }
  }

  function setUrl(i, v) {
    setMediaUrls((u) => u.map((x, idx) => idx === i ? v : x));
  }
  function addUrl() { setMediaUrls((u) => [...u, ""]); }
  function delUrl(i) { setMediaUrls((u) => u.length > 1 ? u.filter((_, idx) => idx !== i) : u); }

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    const cleanUrls = mediaUrls.map((u) => u.trim()).filter(Boolean);
    if (!caption.trim()) return setErr("Legenda obrigatória.");
    if (!cleanUrls.length) return setErr("Pelo menos uma URL de mídia.");
    if (format === "CAROUSEL" && (cleanUrls.length < 2 || cleanUrls.length > 10)) return setErr("Carrossel exige entre 2 e 10 imagens.");
    if (format === "PHOTO" && cleanUrls.length !== 1) return setErr("Foto exige exatamente uma URL.");
    if (format === "REEL" && cleanUrls.length !== 1) return setErr("Reel exige exatamente uma URL de vídeo (MP4 H.264).");
    if (fase2) return setErr("Stories ficam para a Fase 2.");

    const scheduledFor = brtToUtcIso(date, time);
    if (new Date(scheduledFor).getTime() < Date.now() - 60_000) return setErr("Data/hora deve estar no futuro.");

    setSubmitting(true);
    try {
      await onSubmit({
        caption: caption.trim(),
        mediaUrls: cleanUrls,
        format,
        scheduledFor,
        firstComment: firstComment.trim() || null,
        suggestionId: suggestion?.id || initial.suggestionId || null,
      });
      onClose();
    } catch (e) {
      setErr(e.message || "Falha ao agendar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, padding: 24 }}>
        <h3 style={{ marginBottom: 4 }}>{existing ? "Editar agendamento" : recycleFrom ? "🔄 Re-agendar post" : "Agendar publicação Instagram"}</h3>
        {suggestion && <p style={{ color: "#64748b", fontSize: 12, marginBottom: 16 }}>Sugestão: <strong>{suggestion.theme}</strong></p>}
        {recycleFrom && (
          <p style={{ color: "#64748b", fontSize: 12, marginBottom: 16 }}>
            Reciclando: <a href={recycleFrom.permalink} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>{(recycleFrom.caption || "(sem legenda)").slice(0, 60)}{recycleFrom.caption?.length > 60 ? "…" : ""}</a>
            <br/><span style={{ fontSize: 11, color: "#d97706" }}>⚠ A URL da mídia precisa ser nova (publica) — Instagram não baixa de outras URLs do próprio Instagram.</span>
          </p>
        )}
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label>
            <span>Formato</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="status-select" style={{ width: "100%" }}>
              <option value="PHOTO">Foto</option>
              <option value="CAROUSEL">Carrossel (2-10 imagens)</option>
              <option value="REEL">Reel (vídeo MP4)</option>
              <option value="STORY" disabled>Stories — Fase 2</option>
            </select>
          </label>

          <label>
            <span>Legenda <small style={{ color: caption.length > 2200 ? "#dc2626" : "#94a3b8" }}>({caption.length}/2200)</small></span>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} rows={5}
              style={{ width: "100%", padding: 8, border: "1px solid #e2e8f0", borderRadius: 6, resize: "vertical", fontFamily: "inherit" }} />
          </label>

          <div>
            <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>
              {format === "REEL"
                ? "URL do vídeo (HTTPS pública, MP4 H.264, ≤1GB, ≤15min)"
                : "URL(s) da mídia (HTTPS pública, JPEG/PNG, ≤8MB)"}
            </span>
            {mediaUrls.map((u, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <input type="url" value={u} onChange={(e) => setUrl(i, e.target.value)}
                  placeholder={format === "REEL" ? "https://...video.mp4" : "https://..."}
                  style={{ flex: 1, padding: 7, border: "1px solid #e2e8f0", borderRadius: 6 }} />
                {mediaUrls.length > 1 && (
                  <button type="button" onClick={() => delUrl(i)} className="btn-secondary" style={{ padding: "4px 10px" }}>×</button>
                )}
              </div>
            ))}
            {format === "CAROUSEL" && mediaUrls.length < 10 && (
              <button type="button" onClick={addUrl} className="btn-secondary" style={{ marginTop: 6, padding: "5px 12px", fontSize: 12 }}>
                + adicionar imagem
              </button>
            )}
            {format === "REEL" && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#d97706", padding: "6px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4 }}>
                ⏳ Reel é assíncrono — após o tick chamar a API, o Instagram processa o vídeo (até ~4min de polling). Status fica "Publicando" durante esse tempo.
              </div>
            )}
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>Data e hora (BRT)</span>
              <button type="button" onClick={loadBestTime} disabled={loadingBestTime} className="btn-secondary" style={{ padding: "3px 10px", fontSize: 11 }}
                title="Mostra os horários com maior engajamento médio (curtidas + 2×comentários + alcance/10) dos últimos 90 dias">
                {loadingBestTime ? "Analisando…" : "🕐 Melhor horário"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", padding: 7, border: "1px solid #e2e8f0", borderRadius: 6 }} />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: "100%", padding: 7, border: "1px solid #e2e8f0", borderRadius: 6 }} />
            </div>
            {bestTime && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                {bestTime.recommendations?.length > 0 ? (
                  <>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                      Top horários do {bestTime.period} ({bestTime.totalPosts} posts) — clique para aplicar:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {bestTime.recommendations.map((r, i) => (
                        <button key={i} type="button" onClick={() => applyRecommendation(r)}
                          style={{ padding: "5px 10px", border: "1px solid #cbd5e1", borderRadius: 14, background: "white", fontSize: 11, cursor: "pointer", color: "#1e293b" }}
                          title={`${r.sampleSize} post(s) neste bucket · score médio ${r.avgScore}`}>
                          <strong>{WEEKDAYS[r.day]} {String(r.hour).padStart(2, "0")}:00</strong>
                          <span style={{ color: "#94a3b8", marginLeft: 4 }}>· {r.avgScore}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{bestTime.message || "Sem recomendações disponíveis."}</div>
                )}
              </div>
            )}
          </div>

          <label>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>1º comentário (opcional — bom para hashtags) <small style={{ color: "#94a3b8" }}>({firstComment.length}/2200)</small></span>
              <button type="button" onClick={suggestHashtags} disabled={suggestingHashtags || !caption.trim()}
                className="btn-secondary" style={{ padding: "3px 10px", fontSize: 11 }}
                title={!caption.trim() ? "Escreva a legenda primeiro" : "Claude Haiku gera 10 hashtags com base na legenda e adiciona aqui"}>
                {suggestingHashtags ? "Gerando…" : "✨ Sugerir hashtags"}
              </button>
            </span>
            <textarea value={firstComment} onChange={(e) => setFirstComment(e.target.value)} maxLength={2200} rows={2}
              style={{ width: "100%", padding: 8, border: "1px solid #e2e8f0", borderRadius: 6, resize: "vertical", fontFamily: "inherit" }} />
          </label>

          {err && <div style={{ color: "#dc2626", fontSize: 13, padding: "6px 10px", background: "#fee2e2", borderRadius: 4 }}>{err}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 6 }}>
            <div>
              {existing && existing.status !== "PUBLISHED" && existing.status !== "CANCELLED" && (
                <button type="button" onClick={() => { onCancel(existing.id); onClose(); }} className="btn-secondary" style={{ color: "#dc2626" }}>
                  Cancelar agendamento
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>Fechar</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Salvando…" : existing ? "Atualizar" : "Agendar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Calendário Editorial ──────────────────────────────────────────────────────

function dayKeyBRT(d) {
  return new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Belem" });
}

function timeBRT(d) {
  return new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Belem", hour12: false }).slice(0, 5);
}

function CalendarPostCard({ post, onClick }) {
  const color = SCHEDULED_STATUS_COLOR[post.status] || "#64748b";
  const time = timeBRT(post.publishedAt || post.scheduledFor);
  const icon = FORMAT_ICON[post.format] || "•";
  const captionShort = post.caption ? post.caption.replace(/\s+/g, " ").slice(0, 40) : "(sem legenda)";
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "block", width: "100%", textAlign: "left", marginBottom: 4,
        background: color + "18", borderLeft: `3px solid ${color}`,
        padding: "3px 6px", borderRadius: "0 3px 3px 0", border: "none",
        cursor: "pointer", fontSize: 10, color: "#1e293b", lineHeight: 1.3,
      }}
      title={`${SCHEDULED_STATUS_LABEL[post.status]} · ${time}\n${post.caption || "(sem legenda)"}${post.errorMessage ? "\n\n⚠ " + post.errorMessage : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <span style={{ color, fontWeight: 700, fontSize: 9 }}>{time}</span>
        <span style={{ fontSize: 10 }}>{icon}</span>
      </div>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{captionShort}</div>
    </button>
  );
}

function CalendarioEditorial({ scheduledPosts, onScheduleSubmit, onScheduleCancel, suggestions }) {
  const today = new Date();
  const [refDate, setRefDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editModal, setEditModal] = useState(null);   // { existing, suggestion } or { defaultDate }
  const [dayPickerDate, setDayPickerDate] = useState(null);

  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const todayKey = dayKeyBRT(today);

  // Build 6×7 grid
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: new Date(year, month, i - startWeekday + 1), inMonth: false });
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(year, month, i), inMonth: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }

  // Group posts by day key (BRT)
  const filtered = statusFilter === "ALL" ? scheduledPosts : scheduledPosts.filter((p) => p.status === statusFilter);
  const postsByDay = {};
  for (const p of filtered) {
    const key = dayKeyBRT(p.publishedAt || p.scheduledFor);
    if (!postsByDay[key]) postsByDay[key] = [];
    postsByDay[key].push(p);
  }
  for (const key of Object.keys(postsByDay)) {
    postsByDay[key].sort((a, b) =>
      new Date(a.publishedAt || a.scheduledFor) - new Date(b.publishedAt || b.scheduledFor),
    );
  }

  // Counts for header
  const counts = scheduledPosts.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
  counts.ALL = scheduledPosts.length;

  function navigate(delta) {
    setRefDate(new Date(year, month + delta, 1));
  }

  const suggestionById = {};
  for (const s of suggestions || []) suggestionById[s.id] = s;

  function openEdit(post) {
    const sug = post.suggestionId ? suggestionById[post.suggestionId] : null;
    setEditModal({ existing: post, suggestion: sug });
  }

  function openNewForDay(dateObj) {
    if (dateObj.getTime() < new Date(todayKey + "T00:00:00").getTime()) return; // ignora dias passados
    setDayPickerDate(dayKeyBRT(dateObj));
  }

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Cabeçalho com navegação */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)} style={{ padding: "6px 12px" }}>◀</button>
          <h3 style={{ margin: 0, minWidth: 200, textAlign: "center", fontSize: 18, color: "#1e293b" }}>
            {MONTHS_PT[month]} {year}
          </h3>
          <button type="button" className="btn-secondary" onClick={() => navigate(1)} style={{ padding: "6px 12px" }}>▶</button>
          <button type="button" className="btn-secondary" onClick={() => setRefDate(new Date(today.getFullYear(), today.getMonth(), 1))}
            style={{ padding: "6px 12px", marginLeft: 8 }}>Hoje</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {[
            ["ALL", "Todos"],
            ["SCHEDULED", "Agendado"],
            ["PUBLISHING", "Publicando"],
            ["PUBLISHED", "Publicado"],
            ["FAILED", "Falhou"],
            ["CANCELLED", "Cancelado"],
            ["DRAFT", "Rascunho"],
          ].map(([key, label]) => {
            const count = counts[key] ?? 0;
            const active = statusFilter === key;
            const color = key === "ALL" ? "#64748b" : SCHEDULED_STATUS_COLOR[key];
            return (
              <button key={key} type="button" onClick={() => setStatusFilter(key)}
                style={{
                  background: active ? color + "22" : "#f1f5f9",
                  color: active ? color : "#64748b",
                  border: `1px solid ${active ? color + "55" : "transparent"}`,
                  borderRadius: 14, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>
                {label} {count > 0 && <span style={{ opacity: 0.7 }}>· {count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grade do calendário */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#f8fafc" }}>
          {WEEKDAYS.map((wd) => (
            <div key={wd} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#64748b", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>
              {wd}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map((cell, i) => {
            const key = dayKeyBRT(cell.date);
            const dayPosts = postsByDay[key] || [];
            const isToday = key === todayKey;
            const isPast = cell.date.getTime() < new Date(todayKey + "T00:00:00").getTime();
            return (
              <div key={i} onClick={() => openNewForDay(cell.date)}
                style={{
                  minHeight: 96, padding: 5, borderRight: ((i % 7) !== 6) ? "1px solid #f1f5f9" : "none",
                  borderBottom: i < 35 ? "1px solid #f1f5f9" : "none",
                  background: !cell.inMonth ? "#fafbfc" : (isToday ? "#eff6ff" : "white"),
                  opacity: cell.inMonth ? 1 : 0.5,
                  cursor: isPast || !cell.inMonth ? "default" : "pointer",
                  position: "relative",
                }}
                title={isPast || !cell.inMonth ? "" : "Clique para agendar neste dia"}>
                <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, color: isToday ? "#2563eb" : (cell.inMonth ? "#475569" : "#94a3b8"), marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{cell.date.getDate()}</span>
                  {dayPosts.length > 3 && <span style={{ fontSize: 9, color: "#94a3b8" }}>+{dayPosts.length - 3}</span>}
                </div>
                {dayPosts.slice(0, 3).map((p) => (
                  <CalendarPostCard key={p.id} post={p} onClick={() => openEdit(p)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div style={{ marginTop: 12, fontSize: 11, color: "#64748b", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span>Legenda:</span>
        {Object.entries(SCHEDULED_STATUS_LABEL).map(([k, l]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, background: SCHEDULED_STATUS_COLOR[k], borderRadius: 2 }} />
            {l}
          </span>
        ))}
        <span style={{ marginLeft: "auto" }}>Clique em uma data futura vazia para agendar · Clique num card para editar</span>
      </div>

      {editModal && (
        <SchedulePostModal
          suggestion={editModal.suggestion}
          existing={editModal.existing}
          onClose={() => setEditModal(null)}
          onSubmit={(data) => onScheduleSubmit(data, editModal.existing?.id)}
          onCancel={onScheduleCancel}
        />
      )}

      {dayPickerDate && (
        <SchedulePostModal
          suggestion={null}
          existing={null}
          defaultDate={dayPickerDate}
          onClose={() => setDayPickerDate(null)}
          onSubmit={(data) => onScheduleSubmit(data, null)}
          onCancel={onScheduleCancel}
        />
      )}
    </div>
  );
}

function InstagramTab({ posts, suggestions, scheduledPosts, scheduledBySuggestion, onRunCollection, onRunAnalysis, onSuggestionStatus, onScheduleSubmit, onScheduleCancel, running }) {
  const [subTab, setSubTab] = useState("content");
  const [filterAction, setFilterAction] = useState("ALL");
  const [scheduleModal, setScheduleModal] = useState(null); // { suggestion, existing }
  const filtered = filterAction === "ALL" ? posts : posts.filter((p) => p.analysis?.action === filterAction);
  const pendingCount = suggestions.filter((s) => s.status === "PENDING").length;
  const scheduledActiveCount = scheduledPosts.filter((p) => ["SCHEDULED", "PUBLISHING", "DRAFT"].includes(p.status)).length;

  return (
    <div className="leads-tab" style={{ height: "calc(100vh - 104px)", display: "flex", flexDirection: "column", gap: 0, padding: 0, overflow: "hidden" }}>
      <div className="leads-header" style={{ flexShrink: 0, padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
        <div className="period-tabs" style={{ background: "#f1f5f9" }}>
          <button className={`period-tab${subTab === "content" ? " active" : ""}`} onClick={() => setSubTab("content")} type="button">
            Conteúdo {posts.length > 0 ? `(${posts.length})` : ""}
          </button>
          <button className={`period-tab${subTab === "suggestions" ? " active" : ""}`} onClick={() => setSubTab("suggestions")} type="button">
            Sugestão de Conteúdo {pendingCount > 0 ? `(${pendingCount})` : ""}
          </button>
          <button className={`period-tab${subTab === "calendar" ? " active" : ""}`} onClick={() => setSubTab("calendar")} type="button">
            Calendário {scheduledActiveCount > 0 ? `(${scheduledActiveCount})` : ""}
          </button>
        </div>
        {subTab === "content" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="status-select" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
              style={{ color: filterAction === "ALL" ? "#475569" : ACTION_COLOR[filterAction], fontWeight: 600 }}>
              <option value="ALL">Todas as ações</option>
              {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn-secondary" onClick={onRunCollection} disabled={running} type="button">
              {running === "collection" ? "Coletando…" : "Coletar posts"}
            </button>
            <button className="btn-secondary" onClick={onRunAnalysis} disabled={running || posts.length === 0} type="button">
              {running === "analysis" ? "Analisando…" : "Analisar"}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
      {subTab === "content" && (
        posts.length === 0 ? (
          <div className="empty-chart">Nenhum post coletado. Clique em "Coletar posts" para iniciar.</div>
        ) : (
          <div className="table-wrap">
            <table className="camp-table">
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Tipo</th>
                  <th className="num">Curtidas</th>
                  <th className="num">Comentários</th>
                  <th className="num">Alcance</th>
                  <th className="num">Salvamentos</th>
                  <th>Ação</th>
                  <th>Score</th>
                  <th>Justificativa</th>
                  <th>Sugestão</th>
                  <th>Data</th>
                  <th>Reciclar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const recyclable = ["IMAGE", "CAROUSEL_ALBUM", "VIDEO", "REELS"].includes(p.mediaType);
                  return (
                  <tr key={p.id}>
                    <td className="camp-name">
                      {p.permalink
                        ? <a href={p.permalink} target="_blank" rel="noreferrer" className="ig-link">{p.caption ? p.caption.slice(0, 60) + (p.caption.length > 60 ? "…" : "") : "(sem legenda)"}</a>
                        : <span>{p.caption ? p.caption.slice(0, 60) : "(sem legenda)"}</span>
                      }
                    </td>
                    <td><MediaTypeBadge type={p.mediaType} /></td>
                    <td className="num">{p.likeCount.toLocaleString("pt-BR")}</td>
                    <td className="num">{p.commentsCount.toLocaleString("pt-BR")}</td>
                    <td className="num">{p.reach != null ? p.reach.toLocaleString("pt-BR") : "—"}</td>
                    <td className="num">{p.saved != null ? p.saved.toLocaleString("pt-BR") : "—"}</td>
                    <td><ActionBadge action={p.analysis?.action} /></td>
                    <td>{p.analysis ? <ScoreDots score={p.analysis.score} /> : "—"}</td>
                    <td className="ig-reasoning">{p.analysis?.reasoning || "—"}</td>
                    <td className="ig-reasoning">{p.analysis?.suggestion || "—"}</td>
                    <td>{fmtDateFull(p.publishedAt)}</td>
                    <td>
                      {recyclable ? (
                        <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => setScheduleModal({ suggestion: null, existing: null, recycleFrom: p })}
                          title="Re-agendar este post (legenda e formato pré-preenchidos; nova URL de mídia obrigatória)">
                          🔄
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: "#94a3b8" }} title="Tipo de mídia não suportado para reciclagem">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {subTab === "suggestions" && (
        suggestions.length === 0 ? (
          <div className="empty-chart">Nenhuma sugestão gerada ainda. Os agentes rodam automaticamente às 01h BRT.</div>
        ) : (
          <div className="table-wrap">
            <table className="camp-table">
              <thead>
                <tr>
                  <th>Tema</th>
                  <th>Formato</th>
                  <th>Justificativa</th>
                  <th>Status</th>
                  <th>Agendamento</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => {
                  const sched = scheduledBySuggestion?.[s.id];
                  const canSchedule = !sched || ["FAILED", "CANCELLED"].includes(sched.status);
                  return (
                  <tr key={s.id} style={{ opacity: s.status === "DISMISSED" ? 0.45 : 1 }}>
                    <td className="camp-name">{s.theme}</td>
                    <td>
                      <span className="plat-badge" style={{ background: FORMAT_COLOR[s.format] + "22", color: FORMAT_COLOR[s.format], fontWeight: 600 }}>
                        {FORMAT_LABEL[s.format] || s.format}
                      </span>
                    </td>
                    <td className="ig-reasoning">{s.reasoning}</td>
                    <td>
                      <select className="status-select" value={s.status}
                        style={{ color: SUGGESTION_STATUS_COLOR[s.status] }}
                        onChange={(e) => onSuggestionStatus(s.id, e.target.value)}>
                        {Object.entries(SUGGESTION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td>
                      {sched && <ScheduledPostBadge post={sched} />}
                      {canSchedule && (
                        <button type="button" className="btn-secondary" style={{ marginLeft: sched ? 6 : 0, padding: "4px 10px", fontSize: 12 }}
                          onClick={() => setScheduleModal({ suggestion: s, existing: null })}>
                          📅 Agendar
                        </button>
                      )}
                      {sched && ["DRAFT", "SCHEDULED"].includes(sched.status) && (
                        <button type="button" className="btn-secondary" style={{ marginLeft: 6, padding: "4px 10px", fontSize: 12 }}
                          onClick={() => setScheduleModal({ suggestion: s, existing: sched })}>
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {subTab === "calendar" && (
        <CalendarioEditorial
          scheduledPosts={scheduledPosts}
          suggestions={suggestions}
          onScheduleSubmit={onScheduleSubmit}
          onScheduleCancel={onScheduleCancel}
        />
      )}
      </div>
      {scheduleModal && (
        <SchedulePostModal
          suggestion={scheduleModal.suggestion}
          existing={scheduleModal.existing}
          recycleFrom={scheduleModal.recycleFrom}
          onClose={() => setScheduleModal(null)}
          onSubmit={(data) => onScheduleSubmit(data, scheduleModal.existing?.id)}
          onCancel={onScheduleCancel}
        />
      )}
    </div>
  );
}

// ── Agents Tab ───────────────────────────────────────────────────────────────

const STATUS_AGENT_COLOR = { SUCCESS: "#059669", RUNNING: "#2563eb", FAILED: "#dc2626", PENDING: "#d97706" };
const STATUS_AGENT_LABEL = { SUCCESS: "OK", RUNNING: "Rodando", FAILED: "Erro", PENDING: "Pendente" };

const AGENT_JOB_ENDPOINTS = {
  instagram_collection: "/jobs/instagram-collection/run",
  post_analysis: "/jobs/post-analysis/run",
  content_suggestions: "/jobs/content-suggestions/run",
  trending_suggestions: "/jobs/trending-suggestions/run",
  ads_collection: "/jobs/ads-collection/run",
  post_publisher: "/jobs/post-publisher/run",
  instagram_notify: "/jobs/instagram-notify/test",
};

function AgentsTab({ agents, onRun, running }) {
  function fmtDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Belem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="leads-tab">
      <div className="leads-header">
        <h2 className="section-title" style={{ margin: 0 }}>Agentes ({agents.length})</h2>
      </div>
      <div className="table-wrap">
        <table className="camp-table">
          <thead>
            <tr>
              <th>Agente</th>
              <th>Função</th>
              <th>Status</th>
              <th>Última execução</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const status = a.lastRun?.status || null;
              const lastAt = a.lastRun?.finishedAt || a.lastRun?.startedAt || null;
              const hasEndpoint = !!AGENT_JOB_ENDPOINTS[a.jobName];
              const isRunning = running === a.jobName;
              return (
                <tr key={a.jobName}>
                  <td className="camp-name">{a.label}</td>
                  <td style={{ fontSize: 12, color: "#475569", maxWidth: 320 }}>{a.description}</td>
                  <td>
                    {status ? (
                      <div>
                        <span className="plat-badge" style={{ background: STATUS_AGENT_COLOR[status] + "22", color: STATUS_AGENT_COLOR[status], fontWeight: 600 }}>
                          {STATUS_AGENT_LABEL[status] || status}
                        </span>
                        {status === "FAILED" && a.lastRun?.errorMessage && (
                          <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, maxWidth: 320, wordBreak: "break-word" }}>
                            {a.lastRun.errorMessage}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>Nunca executou</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{fmtDateTime(lastAt)}</td>
                  <td>
                    {hasEndpoint && (
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        disabled={!!running}
                        onClick={() => onRun(a.jobName)}
                        type="button"
                      >
                        {isRunning ? "Executando…" : "Executar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    const msg = sessionStorage.getItem("amr_session_msg");
    if (msg) { sessionStorage.removeItem("amr_session_msg"); return msg; }
    return null;
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem("amr_token", data.token);
        onLogin();
      } else {
        setError(data.message || "Senha incorreta");
      }
    } catch {
      setError("Falha ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-brand">
          <span className="brand-dot" />
          AMR Ads Control
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="form-label">Senha de acesso</label>
          <input
            className="form-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
          />
          {error && <div className="login-error">{error}</div>}
          <button className="btn-primary login-btn" type="submit" disabled={loading || !password}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState("overview");
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [weeklyReports, setWeeklyReports] = useState([]);
  const [monthlyGoal, setMonthlyGoal] = useState(null);
  const [leads, setLeads] = useState([]);
  const [igPosts, setIgPosts] = useState([]);
  const [igSuggestions, setIgSuggestions] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [igRunning, setIgRunning] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentRunning, setAgentRunning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  const month = currentMonth();

  const load = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const [s, dy, c, wr, goal, igData, leadsData, csData, agentsData, spData] = await Promise.all([
        apiFetch(`/dashboard/summary?days=${d}`).then((r) => r.json()),
        apiFetch(`/dashboard/daily?days=${d}`).then((r) => r.json()),
        apiFetch(`/dashboard/campaigns?days=${d}`).then((r) => r.json()),
        apiFetch(`/dashboard/weekly-reports`).then((r) => r.json()),
        apiFetch(`/dashboard/monthly-goal?month=${month}`).then((r) => r.json()),
        apiFetch(`/dashboard/instagram-posts`).then((r) => r.json()),
        apiFetch(`/leads`).then((r) => r.json()),
        apiFetch(`/dashboard/content-suggestions`).then((r) => r.json()),
        apiFetch(`/dashboard/agents`).then((r) => r.json()),
        apiFetch(`/api/scheduled-posts`).then((r) => r.json()).catch(() => ({ ok: false })),
      ]);
      if (s.ok) setSummary(s);
      if (dy.ok) setSeries(dy.series || []);
      if (c.ok) setCampaigns(c.campaigns || []);
      if (wr.ok) setWeeklyReports(wr.reports || []);
      if (goal.ok) setMonthlyGoal(goal.goal);
      if (igData.ok) setIgPosts(igData.posts || []);
      if (leadsData.ok) setLeads(leadsData.leads || []);
      if (csData.ok) setIgSuggestions(csData.suggestions || []);
      if (agentsData.ok) setAgents(agentsData.agents || []);
      if (spData.ok) setScheduledPosts(spData.posts || []);
    } catch {
      setError("Falha ao carregar dados do backend.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { if (authed) load(days); }, [authed, days, load]);

  function handleLogout() {
    localStorage.removeItem("amr_token");
    setAuthed(false);
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  async function handleSaveGoal(data) {
    const res = await apiFetch(`/dashboard/monthly-goal`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (d.ok) setMonthlyGoal(d.goal);
    setShowGoalEditor(false);
  }

  async function handleStatusChange(id, status) {
    const res = await apiFetch(`/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = await res.json();
    if (d.ok) setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status: d.lead.status, convertedAt: d.lead.convertedAt } : l));
  }

  async function refreshAgents() {
    const r = await apiFetch("/dashboard/agents").then((res) => res.json());
    if (r.ok) setAgents(r.agents || []);
  }

  async function handleAgentRun(jobName) {
    const endpoint = AGENT_JOB_ENDPOINTS[jobName];
    if (!endpoint) return;
    setAgentRunning(jobName);
    try {
      await apiFetch(endpoint, { method: "POST" });
    } finally {
      await refreshAgents();
      setAgentRunning(null);
    }
  }

  async function handleIgCollection() {
    setIgRunning("collection");
    try {
      const res = await apiFetch("/jobs/instagram-collection/run", { method: "POST" });
      const d = await res.json();
      if (d.ok && d.postsCollected > 0) {
        const ig = await apiFetch("/dashboard/instagram-posts").then((r) => r.json());
        if (ig.ok) setIgPosts(ig.posts || []);
      }
    } finally {
      await refreshAgents();
      setIgRunning(null);
    }
  }

  async function handleIgAnalysis() {
    setIgRunning("analysis");
    try {
      const res = await apiFetch("/jobs/post-analysis/run", { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        const ig = await apiFetch("/dashboard/instagram-posts").then((r) => r.json());
        if (ig.ok) setIgPosts(ig.posts || []);
      }
    } finally {
      setIgRunning(null);
    }
  }

  async function handleIgSuggestions() {
    setIgRunning("suggestions");
    try {
      const res = await apiFetch("/jobs/content-suggestions/run", { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        const cs = await apiFetch("/dashboard/content-suggestions").then((r) => r.json());
        if (cs.ok) setIgSuggestions(cs.suggestions || []);
      }
    } finally {
      setIgRunning(null);
    }
  }

  async function handleTrending() {
    setIgRunning("trending");
    try {
      const res = await apiFetch("/jobs/trending-suggestions/run", { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        const cs = await apiFetch("/dashboard/content-suggestions").then((r) => r.json());
        if (cs.ok) setIgSuggestions(cs.suggestions || []);
      }
    } finally {
      setIgRunning(null);
    }
  }

  async function handleSuggestionStatus(id, status) {
    const res = await apiFetch(`/content-suggestions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (res.ok) {
      setIgSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
    }
  }

  async function refreshScheduledPosts() {
    const r = await apiFetch("/api/scheduled-posts").then((res) => res.json()).catch(() => ({ ok: false }));
    if (r.ok) setScheduledPosts(r.posts || []);
  }

  async function handleScheduleSubmit(data, existingId) {
    const path = existingId ? `/api/scheduled-posts/${existingId}` : "/api/scheduled-posts";
    const method = existingId ? "PUT" : "POST";
    const res = await apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const d = await res.json();
    if (!d.ok) throw new Error(d.message || "Falha ao agendar.");
    await refreshScheduledPosts();
  }

  async function handleScheduleCancel(id) {
    const res = await apiFetch(`/api/scheduled-posts/${id}`, { method: "DELETE" });
    if (res.ok) await refreshScheduledPosts();
  }

  // Map suggestionId → último ScheduledPost dela (mais recente)
  const scheduledBySuggestion = {};
  for (const sp of scheduledPosts) {
    if (!sp.suggestionId) continue;
    const cur = scheduledBySuggestion[sp.suggestionId];
    if (!cur || new Date(sp.createdAt) > new Date(cur.createdAt)) scheduledBySuggestion[sp.suggestionId] = sp;
  }

  const t = summary?.totals;
  const platforms = Object.entries(summary?.byPlatform || {});

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="dash-brand">
          <span className="brand-dot" />
          AMR Ads Control
        </div>
        <div className="dash-controls">
          <div className="period-tabs">
            {[
              { key: "overview", label: "Visão Geral" },
              { key: "weekly", label: "Relatório Semanal" },
              { key: "leads", label: `Leads ${leads.length > 0 ? `(${leads.length})` : ""}` },
              { key: "instagram", label: `Conteúdo ${igPosts.length > 0 ? `(${igPosts.length})` : ""}` },
              { key: "agents", label: "Agentes" },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`period-tab${tab === key ? " active" : ""}`}
                onClick={() => setTab(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="period-tabs" style={{ marginLeft: 8 }}>
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  className={`period-tab${days === p.value ? " active" : ""}`}
                  onClick={() => setDays(p.value)}
                  type="button"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {summary?.lastCollection && (
            <span className="last-update">Atualizado {fmtDatetime(summary.lastCollection)}</span>
          )}
          <button className="logout-btn" onClick={handleLogout} type="button">Sair</button>
        </div>
      </header>

      <main className="dash-main">
        {error && <div className="error-msg">{error}</div>}

        {tab === "overview" && (
          <>
            <AlertBanner alerts={summary?.alerts} />

            <section className="kpi-row">
              <KPICard label="Gasto Total" value={loading ? "…" : brl(t?.spend)} sub={`${days} dias`} />
              <KPICard label="Leads" value={loading ? "…" : (t?.leads ?? 0)} sub="conversões" highlight={t?.leads > 0} />
              <KPICard label="CPL Médio" value={loading ? "…" : (t?.cpl != null ? brl(t.cpl) : "—")} sub="custo por lead" />
              <KPICard label="Impressões" value={loading ? "…" : (t?.impressions ?? 0).toLocaleString("pt-BR")} sub="alcance" />
              <KPICard label="CTR" value={loading ? "…" : pct(t?.ctr)} sub="taxa de clique" />
              <KPICard label="Cliques" value={loading ? "…" : (t?.clicks ?? 0).toLocaleString("pt-BR")} sub="total" />
            </section>

            <MonthlyGoalSection goal={monthlyGoal} totals={t} onEdit={() => setShowGoalEditor(true)} />

            {platforms.length > 0 && (
              <section className="platform-row">
                {platforms.map(([plat, data]) => (
                  <PlatformCard key={plat} platform={plat} data={data} />
                ))}
              </section>
            )}

            <section className="chart-section">
              <h2 className="section-title">Gasto e Leads — {days} dias</h2>
              {series.length === 0 && !loading ? (
                <div className="empty-chart">Sem dados para o período selecionado.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={series} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 12, fill: "#64748b" }} />
                    <YAxis yAxisId="spend" tickFormatter={(v) => `R$${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} tick={{ fontSize: 11, fill: "#64748b" }} width={80} />
                    <YAxis yAxisId="leads" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} width={36} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar yAxisId="leads" dataKey="leads" name="Leads" fill="#10b981" opacity={0.85} radius={[3, 3, 0, 0]} />
                    <Line yAxisId="spend" dataKey="spend" name="Gasto" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="table-section">
              <h2 className="section-title">Campanhas — {days} dias</h2>
              {campaigns.length === 0 && !loading ? (
                <div className="empty-chart">Nenhuma campanha no período.</div>
              ) : (
                <div className="table-wrap">
                  <table className="camp-table">
                    <thead>
                      <tr>
                        <th>Campanha</th>
                        <th>Canal</th>
                        <th className="num">Gasto</th>
                        <th className="num">Impressões</th>
                        <th className="num">Cliques</th>
                        <th className="num">CTR</th>
                        <th className="num">Leads</th>
                        <th className="num">CPL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr
                          key={`${c.platform}-${c.campaignId}`}
                          className="camp-row-clickable"
                          onClick={() => setSelectedCampaign(c)}
                        >
                          <td className="camp-name">{c.campaignName || c.campaignId}</td>
                          <td>
                            <span className="plat-badge" style={{ background: PLATFORM_COLOR[c.platform] + "22", color: PLATFORM_COLOR[c.platform] }}>
                              {PLATFORM_LABEL[c.platform] || c.platform}
                            </span>
                          </td>
                          <td className="num">{brl(c.spend)}</td>
                          <td className="num">{c.impressions.toLocaleString("pt-BR")}</td>
                          <td className="num">{c.clicks.toLocaleString("pt-BR")}</td>
                          <td className="num">{c.ctr != null ? `${c.ctr}%` : "—"}</td>
                          <td className="num leads-cell">{c.leads}</td>
                          <td className={`num ${c.cpl != null && c.cpl > 200 ? "cpl-high" : c.cpl != null ? "cpl-ok" : ""}`}>
                            {c.cpl != null ? brl(c.cpl) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "weekly" && (
          <WeeklyReportSection reports={weeklyReports} />
        )}

        {tab === "leads" && (
          <LeadsTab
            leads={leads}
            onCreated={(lead) => setLeads((prev) => [lead, ...prev])}
            onStatusChange={handleStatusChange}
          />
        )}

        {tab === "instagram" && (
          <InstagramTab
            posts={igPosts}
            suggestions={igSuggestions}
            scheduledPosts={scheduledPosts}
            scheduledBySuggestion={scheduledBySuggestion}
            onRunCollection={handleIgCollection}
            onRunAnalysis={handleIgAnalysis}
            onSuggestionStatus={handleSuggestionStatus}
            onScheduleSubmit={handleScheduleSubmit}
            onScheduleCancel={handleScheduleCancel}
            running={igRunning}
          />
        )}
        {tab === "agents" && <AgentsTab agents={agents} onRun={handleAgentRun} running={agentRunning} />}
      </main>

      {showGoalEditor && (
        <GoalEditorModal
          month={month}
          goal={monthlyGoal}
          onSave={handleSaveGoal}
          onClose={() => setShowGoalEditor(false)}
        />
      )}

      {selectedCampaign && (
        <CampaignDetailModal
          campaign={selectedCampaign}
          days={days}
          onClose={() => setSelectedCampaign(null)}
        />
      )}
    </div>
  );
}
