import { useEffect, useState } from "react";

export default function Dashboard() {
  const [raw, setRaw] = useState("");
  const [urlUsed, setUrlUsed] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // 👇 URL fisso Railway, impossibile sbagliare
  const API_BASE = "https://agente-4-mission-filter-production.up.railway.app";
  const ENDPOINT = `${API_BASE}/api/user/dashboard`;

  useEffect(() => {
    async function load() {
      setUrlUsed(ENDPOINT);
      console.log("🔵 Dashboard calling:", ENDPOINT);

      try {
        const res = await fetch(ENDPOINT);

        if (!res.ok) {
          const msg = await res.text();
          console.error("❌ Dashboard error:", msg);
          setError(`HTTP ${res.status}: ${msg}`);
          setLoading(false);
          return;
        }

        const text = await res.text();
        console.log("✅ Dashboard response:", text);

        setRaw(text);
      } catch (e: any) {
        console.error("🔥 Dashboard exception:", e);
        setError(e.message ?? "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) return <div className="text-white p-6">Caricamento…</div>;
  if (error)
    return (
      <div className="text-red-400 p-6">
        <h2 className="font-bold">Errore Dashboard</h2>
        <p>{error}</p>
        <p className="mt-4 text-sm opacity-60">
          URL usato: <br />
          {urlUsed}
        </p>
      </div>
    );

  return (
    <div className="text-white p-6 space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="bg-gray-800 rounded-xl p-6">
        <p className="text-sm opacity-60 mb-2">URL chiamato:</p>
        <p className="font-mono text-yellow-300">{urlUsed}</p>

        <hr className="my-4 opacity-30" />

        <p className="text-sm opacity-60 mb-2">Risposta raw ricevuta:</p>
        <pre className="bg-black/30 p-4 rounded-lg">{raw}</pre>
      </div>
    </div>
  );
}
