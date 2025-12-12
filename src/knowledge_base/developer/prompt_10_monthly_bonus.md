# BONUS ASSET PROTOCOL: THE 30-DAY STRATEGIC EXECUTION MAP (MONTHLY)

**Ruolo:** Fractional Executive / Strategic Advisor  
**Obiettivo:** Produrre un documento “Board-Ready” che giustifica l’investimento e rende le decisioni governabili **entro 30 giorni**.  
**Asset Output:** “30-Day Strategic Execution Map & Decision Matrix: [MISSION_TITLE]”  
**Lingua Output:** **ITALIANO** (Manageriale, Analitico, Concreto)

---

## 1) INPUT DATI
**Missione:** [MISSION_TITLE]  
**Dettagli:** [MISSION_DESCRIPTION]  
**Fonte:** [MISSION_URL]  
**Skills:** [USER_SKILLS]  
**Vantaggi:** [USER_ADVANTAGES]

---

## 2) REGOLE DI OUTPUT (BOARD READY)
- Qui le **sezioni sono ammesse** e devono essere rispettate.
- Nessun tecnicismo fine a sé stesso: ogni punto deve collegarsi a rischio, costo, time-to-market, qualità o autonomia.
- Tecnologie specifiche **solo** se presenti in [MISSION_DESCRIPTION]; altrimenti usare termini generici (stack, pipeline, backend, UI, dati, integrazioni).
- Se mancano numeri reali: usare soglie o scale qualitative (Basso/Medio/Alto) e indicare che sono **ordini di grandezza**.
- Inserire 1 riferimento naturale a **[USER_SKILLS]** e 1 a **[USER_ADVANTAGES]** per credibilità.
- Output finale: **650–1.200 parole** (completo ma leggibile).

---

## 3) STRUTTURA VISIVA OBBLIGATORIA (COMPLETA)

### TITOLO
**30-Day Strategic Execution Map & Decision Matrix: [MISSION_TITLE]**

Sottotitolo (1 riga):  
Documento decisionale basato su [MISSION_DESCRIPTION], orientato a prevedibilità, riduzione rischio e autonomia operativa **in 30 giorni**.

---

## SEZIONE A — EXECUTIVE SUMMARY (6–10 righe)
- Riassumi obiettivo del progetto e rischio principale.
- Inserisci il frame obbligatorio:
  - “Il vero rischio non è che il sistema non funzioni, ma che funzioni abbastanza da essere usato e poi blocchi l’evoluzione con costi nascosti.”
- Indica l’outcome a 30 giorni: base governabile, rilasci prevedibili, rischio ridotto.

---

## SEZIONE B — SCENARIO PRIMA/DOPO (OUTCOME TANGIBILE)
Tabella obbligatoria: trasforma rischio in controllo. Compila le righe usando il contesto di [MISSION_DESCRIPTION].

| Metrica/Area | Stato Attuale (Rischio) | Target entro 30 giorni (Controllo) | Evidenza/Segnale Misurabile |
|---|---|---|---|
| Deploy/Release | Manuale / fragile | Pipeline ripetibile + rollback | Log di deploy + checklist |
| Qualità | Regressioni / bug ricorrenti | Gate minimi + test base | Report test + staging |
| Osservabilità | Debug “a intuito” | Logging + metriche | Dashboard/alert |
| Performance | Variabile | Soglie definite | Baseline + monitor |
| Manutenibilità | Debito in crescita | Moduli chiari | Struttura repo |
| Sicurezza baseline | Esposizioni non chiare | Controlli minimi | Validazioni + policy |

Nota: se non puoi stimare numeri, usa “Basso/Medio/Alto” o “Stabile/Instabile” e dichiaralo.

---

## SEZIONE C — 30-DAY EXECUTION ROADMAP (WEEKLY GATES)
Ogni settimana deve includere: Obiettivo, Deliverable, Metriche/Segnali, Decision Gate.

### Week 1 — VALIDAZIONE & FILTRO (RIDUZIONE RISCHIO)
**Obiettivo:** creare una base misurabile e verificare il fit operativo senza sunk cost.  
**Deliverable tipici:**
- Baseline misurabile (qualità/performance/affidabilità) o proxy coerenti
- Audit tecnico/operativo + mappa rischi
- Primo deliverable verificabile (setup, vertical slice minimo, staging o equivalente)
- Definizione dei gate di qualità minimi
**Metriche/Segnali:**
- Riproducibilità ambiente (da incerto → ripetibile)
- Errori critici (da invisibili → tracciati)
- Visibilità avanzamento (da “a sensazione” → evidenza)
**Decision Gate (obbligatorio):**
- Continuare / Rifocalizzare / Fermare senza sunk cost

### Week 2 — SISTEMATIZZAZIONE (PROCESSO RIPETIBILE)
**Obiettivo:** trasformare sviluppo “artigianale” in processo prevedibile.  
**Deliverable tipici:**
- Pipeline di integrazione e release (anche minimale)
- Standard minimi (review/test/release)
- Stabilizzazione dei flussi core (UI/API/dati/integrazioni) secondo [MISSION_DESCRIPTION]
**Metriche/Segnali:**
- Frequenza release (da sporadica → regolare)
- Regressioni (da frequenti → ridotte)
- Tempo diagnosi (da ore → minuti)
**Decision Gate (obbligatorio):**
- Accelerare / Consolidare

### Week 3 — DELIVERY CORE (IMPATTO IMMEDIATO)
**Obiettivo:** rilasciare le feature core con impatto e ridurre il rework.  
**Deliverable tipici:**
- Implementazione e integrazione feature core prioritarie
- Hardening sui colli di bottiglia (stabilità/performance)
- Staging aggiornato e verifiche giornaliere (o cadenza definita)
**Metriche/Segnali:**
- Lead time (da lungo → più corto)
- Affidabilità release (da rischiosa → prevedibile)
- Bug critici (da ricorrenti → tracciati e risolti)
**Decision Gate (obbligatorio):**
- Spingere feature / Fermarsi e stabilizzare

### Week 4 — STABILIZZAZIONE & POWER TRANSFER (NO-LOCKIN)
**Obiettivo:** consegnare un sistema governabile e trasferire controllo al team.  
**Deliverable tipici:**
- Stabilizzazione finale + riduzione rischio residuo
- Documentazione operativa completa (Playbook/Runbook)
- Standard di manutenzione e onboarding
- Roadmap immediata post-30 giorni (2–4 settimane) con rischi/priorità
**Metriche/Segnali:**
- Autonomia team (da dipendenza → gestione interna)
- Incident response (da improvvisato → runbook)
**Decision Gate (obbligatorio):**
- Internalizzare / Proseguire partnership / Estendere scope

---

## SEZIONE D — DECISION MATRIX (SCELTE GOVERNABILI)
Tabella obbligatoria: criteri, segnali, decisione consigliata.

| Criterio | Segnale “OK” | Segnale “Rischio” | Decisione |
|---|---|---|---|
| Stabilità | errori tracciati | crash silenziosi | stabilizzare |
| Time-to-market | release regolari | blocchi frequenti | rifocalizzare |
| Qualità | regressioni rare | hotfix continui | alzare gate |
| Autonomia | runbook presente | dipendenza totale | trasferire potere |

---

## SEZIONE E — DISCIPLINED PROCESS (ANTI-MAGIA, DOLORE EVITATO)
Inserire blocco obbligatorio (adattare ma non rimuovere il senso):

> “La metodologia non è magia né automazione cieca: ogni ciclo ha metriche, fallback e controllo umano.  
> In pratica significa: meno PR che rompono la produzione, meno bug di regressione, meno deploy ad alto stress e meno interventi d’emergenza.”

Aggiungere 3 gate (generici) con 1 riga ciascuno:
- Review Gate (coerenza + standard)
- Test Gate (regressioni minime)
- Release Gate (rollback e verifiche)

---

## SEZIONE F — PLAYBOOK NO-LOCKIN (POWER TRANSFER)
Descrivere il Playbook come trasferimento di potere.

Contenuti minimi (bullet obbligatori, 6–10):
- Architettura (overview + confini moduli)
- Runbook deploy (passi + rollback)
- Checklist incidenti (triage + diagnosi)
- Standard review (pattern e anti-pattern)
- Convezioni (naming, struttura, config)
- Onboarding rapido (avviare, testare, rilasciare)
- “Definition of Done” minima
- Backlog hygiene (come prioritizzare senza caos)

Frase obbligatoria:
> “Il Playbook serve a rendere il team autonomo ed evitare lock-in, anche nei miei confronti.”

---

## SEZIONE G — ROI MODEL (SPIEGATO, NON “SPARATO”)
Mini-modello con 3 leve + spiegazione da cosa deriva:

1) **Tempo risparmiato:** cicli più brevi e meno rework  
2) **Bug evitati:** meno regressioni e meno hotfix  
3) **Riscritture evitate:** riduzione debito e costi futuri

Inserire una riga obbligatoria di trasparenza:
> “Le stime dipendono dalle metriche attuali e dai volumi; qui sono presentate come ordine di grandezza per supportare la decisione.”

---

## SEZIONE H — NEXT STEPS (PIANO D’AZIONE IMMEDIATO)
3 step concreti (obbligatori):
1) Raccolta KPI minimi e definizione target (anche qualitativi)
2) Definizione del **decision gate Week 1** e deliverable verificabile
3) Avvio, cadenza di reporting (giornaliera o bisettimanale) e criteri di “done”

---

## AZIONE
Genera ora la 30-Day Strategic Execution Map completa per [MISSION_TITLE], usando [MISSION_DESCRIPTION] come fonte primaria e includendo un riferimento a [USER_SKILLS] e a [USER_ADVANTAGES].
