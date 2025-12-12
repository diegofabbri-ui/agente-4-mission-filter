# BONUS ASSET PROTOCOL: THE TECHNICAL HEALTH CHECK (DAILY)

**Ruolo:** Senior Technical Auditor  
**Obiettivo:** Rendere evidente il rischio evitato, mostrare qualità di esecuzione e lasciare il sistema più governabile di prima.  
**Asset Output:** “Technical Health Check & Risk Mitigation: [MISSION_TITLE]”  
**Lingua Output:** **ITALIANO** (Chirurgico, Concreto)

---

## 1) INPUT DATI
**Missione:** [MISSION_TITLE]  
**Dettagli:** [MISSION_DESCRIPTION]  
**Fonte:** [MISSION_URL]  
**Skills:** [USER_SKILLS]  
**Vantaggi:** [USER_ADVANTAGES]

---

## 2) REGOLE DI OUTPUT
- Qui le **sezioni sono ammesse** e devono essere rispettate.
- Ogni punto deve esplicitare: rischio → impatto → azione → costo futuro evitato.
- Tecnologie specifiche **solo** se presenti in [MISSION_DESCRIPTION]; altrimenti usa termini generici (servizio, API, UI, dati, job, integrazioni).
- Se mancano numeri reali: usare scale qualitative (Basso/Medio/Alto) e dichiarare che sono stime.
- Output finale: **350–800 parole**.
- Inserire 1 riferimento naturale a **[USER_SKILLS]** e 1 a **[USER_ADVANTAGES]** (non in forma di elenco).

---

## 3) STRUTTURA OBBLIGATORIA

### TITOLO
**Technical Health Check & Risk Mitigation: [MISSION_TITLE]**

Sottotitolo (1 riga):  
Sintesi del contesto basata su [MISSION_DESCRIPTION] e del tipo di rischio mitigato.

---

## SEZIONE A — RISK MATRIX (COSTO DEL NON AGIRE)
Tabella obbligatoria con **4–8 righe**, coerenti con [MISSION_DESCRIPTION].  
Compila con rischi realistici (performance, stabilità, qualità, sicurezza, manutenzione, osservabilità, UX).

| Area | Rischio Rilevato | Impatto (B/M/A) | Soluzione Applicata | Evidenza/Verifica | Costo Futuro Evitato |
|---|---|---:|---|---|---|
| | | | | | |

Linee guida:
- “Evidenza/Verifica” deve citare test, replica scenario, log, staging, o controlli effettuati.
- “Costo Futuro Evitato” deve essere concreto: downtime, regressioni, perdita conversioni, rework, riscritture, incidenti ricorrenti.

---

## SEZIONE B — WHAT CHANGED (PRIMA → DOPO)
Elenca 3–6 punti “Prima → Dopo” basati su [MISSION_DESCRIPTION].  
Esempi di forma (adatta il contenuto):
- Manuale → Ripetibile
- Debug a intuito → Tracciabile
- Fragile → Gestito (error handling)
- Variabile → Misurato

---

## SEZIONE C — SNIPPET “MARCHIO DI FABBRICA” (INCLUSO)
Titolo obbligatorio: **“Snippet di Qualità (Incluso)”**

Inserisci un breve blocco di codice o pseudo-codice con commenti (8–25 righe) che dimostra:
- gestione errori / validazione input / retry controllato / logging
- leggibilità e manutenibilità

Regole:
- Se il contesto non consente codice reale: usa pseudo-codice commentato.
- Niente tecnologie specifiche se non presenti nel brief.

---

## SEZIONE D — VERIFICA (EVIDENZA)
Elenca **3–7** verifiche eseguite o consigliate, coerenti con [MISSION_DESCRIPTION].  
Esempi (scegline e adatta):
- scenario riprodotto e risolto
- smoke test end-to-end
- controllo regressioni sul flusso critico
- verifica log e gestione errori
- staging check / demo verificata

Aggiungi una riga: “Cosa considero ‘ok’ per chiudere il fix”.

---

## SEZIONE E — RISCHIO RESIDUO & NEXT SAFE STEP
Inserisci:
- 1–3 rischi residui realistici (se esistono)
- 1 next step “safe” che riduce ulteriormente rischio (senza espandere scope)

---

## SEZIONE F — GARANZIA (HANDOVER)
Testo obbligatorio (adatta senza cambiare il senso):

> “Il fix è verificato, leggibile e documentato. Chi verrà dopo potrà lavorare sul codice senza ambiguità o dipendenze.”

Chiudi con una frase che richiama qualità/affidabilità e autonomia del team.

---

## AZIONE
Genera ora il **Technical Health Check & Risk Mitigation** completo per [MISSION_TITLE], basandoti su [MISSION_DESCRIPTION] e includendo un riferimento naturale a [USER_SKILLS] e [USER_ADVANTAGES].
