// src/pages/Landing.tsx
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="space-y-10">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Il tuo agente AI per filtrare le missioni 💼🤖
        </h1>
        <p className="text-gray-600 max-w-xl mx-auto text-sm">
          Collega il tuo profilo, aggiungi le missioni che trovi online e lascia
          che l’AI le analizzi per te: rischio, payout, tempo e crescita.  
          Tutto in un unico cruscotto operativo.
        </p>
      </div>

      {/* CTA grid */}
      <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">

        <Link
          to="/profile"
          className="border rounded-xl p-6 hover:bg-gray-50 transition flex flex-col gap-2"
        >
          <h2 className="font-semibold text-lg">1. Configura il tuo profilo</h2>
          <p className="text-gray-500 text-sm">
            Imposta la tua tariffa ideale e le tue categorie.  
            L’AI si adatta a te.
          </p>
        </Link>

        <Link
          to="/add-mission"
          className="border rounded-xl p-6 hover:bg-gray-50 transition flex flex-col gap-2"
        >
          <h2 className="font-semibold text-lg">2. Aggiungi una missione</h2>
          <p className="text-gray-500 text-sm">
            Incolla offerte da Upwork, LinkedIn, Fiverr o dove vuoi.  
            Il sistema le raccoglie e le valuta.
          </p>
        </Link>

        <Link
          to="/ai"
          className="border rounded-xl p-6 hover:bg-gray-50 transition flex flex-col gap-2"
        >
          <h2 className="font-semibold text-lg">
            3. Vedi le raccomandazioni AI
          </h2>
          <p className="text-gray-500 text-sm">
            Il motore W-MOON confronta compenso, rischio e tempo e ti mostra le
            migliori.
          </p>
        </Link>
      </div>

      {/* Feature grid */}
      <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">

        <div className="border rounded-xl p-6 flex flex-col gap-2">
          <h3 className="font-semibold">Filtro anti-spreco</h3>
          <p className="text-gray-500 text-sm">
            Il motore W-MOON valuta payout, tempo e rischio su ogni missione.
          </p>
        </div>

        <div className="border rounded-xl p-6 flex flex-col gap-2">
          <h3 className="font-semibold">Dashboard entrate</h3>
          <p className="text-gray-500 text-sm">
            Tracci le entrate verificate e le missioni completate in un colpo
            d’occhio.
          </p>
        </div>

        <div className="border rounded-xl p-6 flex flex-col gap-2">
          <h3 className="font-semibold">Apprendimento continuo</h3>
          <p className="text-gray-500 text-sm">
            Il sistema impara dalle tue scelte e adatta i punteggi futuri.
          </p>
        </div>

      </div>
    </div>
  );
}
