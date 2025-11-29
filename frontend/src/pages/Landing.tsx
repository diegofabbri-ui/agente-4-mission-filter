// src/pages/Landing.tsx
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="space-y-12 py-8">
      {/* HERO */}
      <section className="text-center space-y-4">
        <p className="text-xs font-medium tracking-[0.2em] uppercase text-gray-500">
          Agente 4
        </p>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Il tuo agente AI per filtrare le missioni 💼🤖
        </h1>

        <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">
          Collega il tuo profilo, aggiungi le missioni che trovi online e lascia
          che l’AI le analizzi per te: rischio, payout, tempo e crescita.
          Tutto in un unico cruscotto operativo pensato per non farti sprecare
          energie su lavori sbagliati.
        </p>

        <div className="flex justify-center gap-3 mt-4">
          <Link
            to="/profile"
            className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
          >
            Inizia dal profilo
          </Link>
          <Link
            to="/add-mission"
            className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-white"
          >
            Aggiungi subito una missione
          </Link>
        </div>
      </section>

      {/* STEP GRID */}
      <section className="max-w-5xl mx-auto px-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Come funziona
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Profilo */}
          <Link
            to="/profile"
            className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all flex flex-col gap-3"
          >
            <span className="text-xs font-semibold text-gray-500">
              STEP 1
            </span>
            <h3 className="font-semibold text-lg">
              Configura il tuo profilo
            </h3>
            <p className="text-gray-500 text-sm">
              Imposta la tariffa oraria minima e le categorie di lavoro.
              L’AI usa questi dati per capire cosa ha senso proporre e cosa no.
            </p>
          </Link>

          {/* Aggiungi missione */}
          <Link
            to="/add-mission"
            className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all flex flex-col gap-3"
          >
            <span className="text-xs font-semibold text-gray-500">
              STEP 2
            </span>
            <h3 className="font-semibold text-lg">
              Aggiungi una missione
            </h3>
            <p className="text-gray-500 text-sm">
              Incolla le offerte trovate su Upwork, LinkedIn, Fiverr o ovunque.
              Il sistema le importa, le pulisce e le manda al motore W-MOON.
            </p>
          </Link>

          {/* Raccomandazioni AI */}
          <Link
            to="/ai"
            className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all flex flex-col gap-3"
          >
            <span className="text-xs font-semibold text-gray-500">
              STEP 3
            </span>
            <h3 className="font-semibold text-lg">
              Vedi le raccomandazioni AI
            </h3>
            <p className="text-gray-500 text-sm">
              Vedi subito quali missioni hanno il miglior rapporto tra tempo,
              compenso e rischio, già ordinate per priorità.
            </p>
          </Link>
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-5xl mx-auto px-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Cosa fa davvero per te
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all cursor-default flex flex-col gap-2">
            <h3 className="font-semibold">Filtro anti-spreco</h3>
            <p className="text-gray-500 text-sm">
              Il motore W-MOON valuta payout, tempo richiesto e livello di rischio
              per tagliare le missioni poco profittevoli o sospette.
            </p>
          </div>

          <div className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all cursor-default flex flex-col gap-2">
            <h3 className="font-semibold">Dashboard entrate</h3>
            <p className="text-gray-500 text-sm">
              Tracci entrate, missioni accettate e completate, così vedi subito
              se stai usando bene il tuo tempo o no.
            </p>
          </div>

          <div className="border rounded-xl p-6 hover:bg-gray-50 hover:shadow-md transition-all cursor-default flex flex-col gap-2">
            <h3 className="font-semibold">Apprendimento continuo</h3>
            <p className="text-gray-500 text-sm">
              Ogni missione che accetti o rifiuti allena il modello per
              affinare i punteggi alle tue vere preferenze.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

