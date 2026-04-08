import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://amanda-api.onrender.com";

const STATUS_MAP = {
  loading: {
    label: "Sincronizando infraestrutura",
    className: "status-chip loading",
  },
  ok: {
    label: "Ambiente operacional",
    className: "status-chip ok",
  },
  error: {
    label: "Atenção na integração",
    className: "status-chip error",
  },
};

function App() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Conectando ao backend para validar ambiente...");

  useEffect(() => {
    async function checkBackend() {
      try {
        const response = await fetch(`${API_BASE_URL}/health/db`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        setStatus("ok");
        setMessage(`Backend online | DB: ${payload.db} | Regra de data: ${payload.businessDateRule}`);
      } catch (error) {
        setStatus("error");
        setMessage(`Falha ao validar backend (${error instanceof Error ? error.message : "erro desconhecido"}).`);
      }
    }

    void checkBackend();
  }, []);

  const statusUi = useMemo(() => STATUS_MAP[status] || STATUS_MAP.loading, [status]);

  return (
    <main className="entry-page">
      <section className="entry-shell">
        <header className="topbar">
          <p className="brand">AMR Ads Control</p>
          <span className={statusUi.className}>{statusUi.label}</span>
        </header>

        <div className="hero-grid">
          <article className="hero-copy">
            <p className="eyebrow">Painel de Entrada</p>
            <h1>Advocacia empresarial orientada por dados de mídia.</h1>
            <p className="subtitle">
              Sistema dedicado para captação qualificada em São Paulo com rotina de monitoramento,
              decisões semanais e execução disciplinada.
            </p>

            <div className="actions">
              <button type="button" className="primary-btn">
                Entrar no Sistema
              </button>
              <a className="secondary-link" href="#status-operacional">
                Ver status técnico
              </a>
            </div>
          </article>

          <aside className="status-card" id="status-operacional">
            <h2>Status Operacional</h2>
            <p className="status-message">{message}</p>
            <dl>
              <div>
                <dt>API Base</dt>
                <dd>{API_BASE_URL}</dd>
              </div>
              <div>
                <dt>Data de Negócio</dt>
                <dd>UTC-3 T12:00:00</dd>
              </div>
              <div>
                <dt>Foco do Projeto</dt>
                <dd>Leads qualificados para fee mensal</dd>
              </div>
            </dl>
          </aside>
        </div>

        <section className="quick-panels">
          <article>
            <h3>Escopo</h3>
            <p>Google Ads, Meta Ads e Instagram Ads em operação unificada.</p>
          </article>
          <article>
            <h3>Direção</h3>
            <p>Resumo executivo semanal: manter, pausar e escalar com base em resultado.</p>
          </article>
          <article>
            <h3>Disciplina</h3>
            <p>Coleta diária automatizada com trilha de execução e dados auditáveis.</p>
          </article>
        </section>
      </section>
    </main>
  );
}

export default App;
