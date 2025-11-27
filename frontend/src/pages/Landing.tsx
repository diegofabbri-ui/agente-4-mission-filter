// src/pages/Landing.tsx
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="space-y-12">

      {/* HERO */}
      <div className="text-center space-y-4 mt-6">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Agente 4
        </h1>

        <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">
          Il tuo agente AI per filtrare le missioni 💼🤖.  
          Collega il tuo profilo, aggiungi le missioni che trovi online e lascia che l’AI
          le analizzi per te: rischio, payout, tempo e crescita.  
          Tutto in un unico cruscotto operativo.
        </p>
      </div>

      {/* CTA GRID */}
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto px-4">

        {/* Profilo */}
        <Link
          to="/profile"
          className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all flex flex-col gap-3"
        >
          <h2 className="font-semibold text-lg">
            1. Configura il tuo profilo
          </h2>
          <p className="text-gray-500 text-sm">
            Imposta la tua tariffa ideale e le categorie di lavoro.  
            L’AI personalizza le raccomandazioni sul tuo stile.
          </p>
        </Link>

        {/* Aggiungi missione */}
        <Link
          to="/add-mission"
          className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all flex flex-col gap-3"
        >
          <h2 className="font-semibold text-lg">
            2. Aggiungi una missione
          </h2>
          <p className="text-gray-500 text-sm">
            Incolla offerte trovate su Upwork, LinkedIn, Fiverr e ovunque.
            Il sistema le importa e le analizza automaticamente.
          </p>
        </Link>

        {/* Raccomandazioni AI */}
        <Link
          to="/ai"
          className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all flex flex-col gap-3"
        >
          <h2 className="font-semibold text-lg">
            3. Vedi le raccomandazioni AI
          </h2>
          <p className="text-gray-500 text-sm">
            Il motore W-MOON confronta compenso, rischio e tempo per mostrarti
            solo le missioni con il miglior rapporto qualità/tempo/ricavi.
          </p>
        </Link>

      </div>

      {/* FEATURE CARDS */}
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto px-4">

        <div className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all cursor-default flex flex-col gap-2">
          <h3 className="font-semibold">Filtro anti-spreco</h3>
          <p className="text-gray-500 text-sm">
            Il motore W-MOON valuta payout, tempo richiesto e livello di rischio
            per evitarti missioni non profittevoli.
          </p>
        </div>

        <div className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all cursor-default flex flex-col gap-2">
          <h3 className="font-semibold">Dashboard entrate</h3>
          <p className="text-gray-500 text-sm">
            Tieni traccia delle entrate confermate, missioni accettate,
            completate e andamento giornaliero.
          </p>
        </div>

        <div className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all cursor-default flex flex-col gap-2">
          <h3 className="font-semibold">Apprendimento continuo</h3>
          <p className="text-gray-500 text-sm">
            Il sistema impara dalle tue scelte e adatta i punteggi futuri
            migliorando la qualità delle raccomandazioni.
          </p>
        </div>

      </div>

    </div>
  );
}
