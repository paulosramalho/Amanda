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
  ORGANIC: "Orgânico", REFERRAL: "Indicação", OTHER: "Outro",
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
                <th>Empresa</th>
                <th>Telefone</th>
                <th>Origem</th>
                <th>Campanha</th>
                <th className="num">Fee Potencial</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="camp-name">{lead.name || "—"}</td>
                  <td>{lead.companyName || "—"}</td>
                  <td>{lead.phone || "—"}</td>
                  <td>
                    <span className="plat-badge" style={{ background: "#f1f5f9", color: "#475569" }}>
                      {SOURCE_LABEL[lead.source] || lead.source}
                    </span>
                  </td>
                  <td>{lead.campaignName || "—"}</td>
                  <td className="num">{lead.monthlyFeePotential ? brl(lead.monthlyFeePotential) : "—"}</td>
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
              ))}
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

function InstagramTab({ posts, onRunCollection, onRunAnalysis, running }) {
  return (
    <div className="leads-tab">
      <div className="leads-header">
        <h2 className="section-title" style={{ margin: 0 }}>Conteúdo — @amandamramalho ({posts.length})</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={onRunCollection} disabled={running} type="button">
            {running === "collection" ? "Coletando…" : "Coletar posts"}
          </button>
          <button className="btn-primary" onClick={onRunAnalysis} disabled={running || posts.length === 0} type="button">
            {running === "analysis" ? "Analisando…" : "Analisar"}
          </button>
        </div>
      </div>

      {posts.length === 0 ? (
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
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
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
                  <td>{fmtDateFull(p.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  const [igRunning, setIgRunning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  const month = currentMonth();

  const load = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const [s, dy, c, wr, goal, igData, leadsData] = await Promise.all([
        apiFetch(`/dashboard/summary?days=${d}`).then((r) => r.json()),
        apiFetch(`/dashboard/daily?days=${d}`).then((r) => r.json()),
        apiFetch(`/dashboard/campaigns?days=${d}`).then((r) => r.json()),
        apiFetch(`/dashboard/weekly-reports`).then((r) => r.json()),
        apiFetch(`/dashboard/monthly-goal?month=${month}`).then((r) => r.json()),
        apiFetch(`/dashboard/instagram-posts`).then((r) => r.json()),
        apiFetch(`/leads`).then((r) => r.json()),
      ]);
      if (s.ok) setSummary(s);
      if (dy.ok) setSeries(dy.series || []);
      if (c.ok) setCampaigns(c.campaigns || []);
      if (wr.ok) setWeeklyReports(wr.reports || []);
      if (goal.ok) setMonthlyGoal(goal.goal);
      if (igData.ok) setIgPosts(igData.posts || []);
      if (leadsData.ok) setLeads(leadsData.leads || []);
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
            onRunCollection={handleIgCollection}
            onRunAnalysis={handleIgAnalysis}
            running={igRunning}
          />
        )}
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
