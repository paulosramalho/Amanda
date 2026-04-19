import { useEffect, useState, useCallback } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import "./App.css";

const API = import.meta.env.VITE_API_BASE_URL || "https://amanda-api.onrender.com";

const PERIODS = [
  { label: "7 dias", value: 7 },
  { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 },
];

const PLATFORM_LABEL = { GOOGLE_ADS: "Google Ads", META_ADS: "Meta Ads" };
const PLATFORM_COLOR = { GOOGLE_ADS: "#1d4ed8", META_ADS: "#7c3aed" };

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

function fmtDatetime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Belem", dateStyle: "short", timeStyle: "short" });
}

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

function WeeklyReportSection({ report }) {
  if (!report) return null;
  const meta = report.recommendations?.summary || {};
  const items = report.recommendations?.items || [];
  const priorityColor = { alta: "#dc2626", média: "#d97706", info: "#2563eb" };

  return (
    <section className="weekly-report-section">
      <h2 className="section-title">Relatório Semanal — {report.weekStartDate?.slice(0, 10).split("-").reverse().join("/")} a {report.weekEndDate?.slice(0, 10).split("-").reverse().join("/")}</h2>
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

export default function App() {
  const [tab, setTab] = useState("overview");
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const [s, dy, c, wr] = await Promise.all([
        fetch(`${API}/dashboard/summary?days=${d}`).then((r) => r.json()),
        fetch(`${API}/dashboard/daily?days=${d}`).then((r) => r.json()),
        fetch(`${API}/dashboard/campaigns?days=${d}`).then((r) => r.json()),
        fetch(`${API}/dashboard/weekly-report`).then((r) => r.json()),
      ]);
      if (s.ok) setSummary(s);
      if (dy.ok) setSeries(dy.series || []);
      if (c.ok) setCampaigns(c.campaigns || []);
      if (wr.ok) setWeeklyReport(wr.report);
    } catch (e) {
      setError("Falha ao carregar dados do backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

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
            <button
              className={`period-tab${tab === "overview" ? " active" : ""}`}
              onClick={() => setTab("overview")}
              type="button"
            >
              Visão Geral
            </button>
            {weeklyReport && (
              <button
                className={`period-tab${tab === "weekly" ? " active" : ""}`}
                onClick={() => setTab("weekly")}
                type="button"
              >
                Relatório Semanal
              </button>
            )}
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
            <span className="last-update">
              Atualizado {fmtDatetime(summary.lastCollection)}
            </span>
          )}
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
                        <tr key={`${c.platform}-${c.campaignId}`}>
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

        {tab === "weekly" && <WeeklyReportSection report={weeklyReport} />}
      </main>
    </div>
  );
}
