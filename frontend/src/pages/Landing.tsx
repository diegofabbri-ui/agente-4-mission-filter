// src/pages/Landing.tsx
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-8 text-center">
      <div className="space-y-4 max-w-xl">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Il tuo agente AI per filtrare le missioni 💼🤖
        </h1>
        <p className="text-gray-600 text-lg">
          Collega il tuo profilo, aggiungi le missioni che trovi online e lascia
          che l’AI le analizzi per te: rischio, payout, tempo e crescita,
          tutto in un unico cruscotto.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <Link
          to="/profile"
          className="px-6 py-3 rounded-lg bg-black text-white font-semibold hover:bg-gray-900 transition"
        >
          1. Configura il tuo profilo
        </Link>
        <Link
          to="/missions/new"
          className="px-6 py-3 rounded-lg border border-gray-300 font-semibold hover:bg-gray-100 transition"
        >
          2. Aggiungi una missione
        </Link>
        <Link
          to="/missions/ai"
          className="px-6 py-3 rounded-lg border border-blue-500 text-blue-600 font-semibold hover:bg-blue-50 transition"
        >
          3. Vedi le raccomandazioni AI
        </Link>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3 max-w-4xl w-full">
        <div className="p-4 rounded-xl bg-white shadow-sm border border-gray-100">
          <h2 className="font-semibold mb-1">Filtro anti-spreco</h2>
          <p className="text-sm text-gray-600">
            Il motore W-MOON valuta payout, tempo e rischio su ogni missione.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white shadow-sm border border-gray-100">
          <h2 className="font-semibold mb-1">Dashboard entrate</h2>
          <p className="text-sm text-gray-600">
            Tracci le entrate verificate e le missioni completate in un colpo d’occhio.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white shadow-sm border border-gray-100">
          <h2 className="font-semibold mb-1">Apprendimento continuo</h2>
          <p className="text-sm text-gray-600">
            Il sistema impara dalle tue scelte e adatta i punteggi futuri.
          </p>
        </div>
      </div>
    </div>
  );
}
