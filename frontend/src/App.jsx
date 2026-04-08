import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://amanda-api.onrender.com";

function App() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Consultando backend...");

  useEffect(() => {
    async function checkBackend() {
      try {
        const response = await fetch(`${API_BASE_URL}/health/db`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        setStatus("ok");
        setMessage(`Backend online. DB: ${payload.db}. Regra: ${payload.businessDateRule}`);
      } catch (error) {
        setStatus("error");
        setMessage(`Falha ao consultar backend (${error instanceof Error ? error.message : "erro desconhecido"}).`);
      }
    }

    void checkBackend();
  }, []);

  const statusClass = useMemo(() => {
    if (status === "ok") {
      return "badge ok";
    }

    if (status === "error") {
      return "badge error";
    }

    return "badge loading";
  }, [status]);

  return (
    <main className="page">
      <section className="panel">
        <p className="kicker">Amanda Ads</p>
        <h1>Painel em inicializacao</h1>
        <p className="subtitle">
          Frontend publicado na Vercel, API no Render e base no Neon.
        </p>

        <div className={statusClass}>{message}</div>

        <dl className="meta">
          <div>
            <dt>API Base</dt>
            <dd>{API_BASE_URL}</dd>
          </div>
          <div>
            <dt>Data de negocio</dt>
            <dd>UTC-3 T12:00:00</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

export default App;
