import { useEffect, useState } from "react";

export default function Dashboard() {
  const [msg, setMsg] = useState("Inizializzazione componente…");
  const [urlUsed, setUrlUsed] = useState("");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // URL fisso Railway
  const API_BASE = "https://agente-4-mission-filter-production.up.railway.app";
  const ENDPOINT = `${API_BASE}/api/user/dashboard`;

  // DEBUG immediato
  console.log("🔥 Il componente Dashboard.tsx CORRETTO è stato caricato.");
  console.log("👉 URL che useremo:", ENDPOINT);

  useEffect(() => {
    async function load() {
      setUrlUsed(ENDPOINT);
      setMsg("Chiamata al backend in corso…");

      try {
        console.log("📡 Fetch →", ENDPOINT);
        const res = await fetch(ENDPOINT);

        if (!res.ok) {
          const text = await res.text();
          console.error("❌ Errore HTTP:", res.status, text);
          setError(`HTTP ${res.status}: ${text}`);
          setLoading(false);
          return;
        }

        const text = await res.text();
        console.log("✅ Risposta ricevuta:", text);

        setRaw(text);
      } catch (e: any) {
        console.error("🔥 Exception:", e);
        setError(e.message ?? "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="text-white p-6 space-y-6">
      <h1 style={{ fontSize: "48px", fontWeight: "700" }}>
        LOADED DASHBOARD FILE CORRETTO
      </h1>

      <p className="opacity-70">{msg}</p>

      <div className="bg-gray-800 rounded-xl p-6">
        <p className="text-sm opacity-60 mb-2">URL usato:</p>
        <p className="font-mono text-yellow-300">{ENDPOINT}</p>
      </div>

      {loading && <p>Caricamento…</p>}

      {error && (
        <div className="text-red-400">
          <h2 className="font-bold">Errore</h2>
          <pre>{error}</pre>
        </div>
      )}

      {raw && (
        <div className="bg-black/30 p-4 rounded-lg">
          <pre>{raw}</pre>
        </div>
      )}
    </div>
  );
}

