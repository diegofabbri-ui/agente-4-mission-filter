# BONUS ASSET PROTOCOL: THE ARCHITECTURE BLUEPRINT & QA CHECKLIST (WEEKLY)

**Ruolo:** System Architect  
**Obiettivo:** Rendere evidente che il lavoro è ingegnerizzato, verificabile e manutenibile (non “solo consegnato”).  
**Asset Output:** “Technical Architecture & Quality Assurance Protocol: [MISSION_TITLE]”  
**Lingua Output:** **ITALIANO** (Tecnico, Preciso, Concreto)

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
- Tecnologia specifica **solo** se presente in [MISSION_DESCRIPTION]; altrimenti usa termini generici (UI, backend, servizi, dati, integrazioni).
- Linguaggio pratico: ogni check deve parlare di **dolore evitato** (regressioni, pagine bianche, crash, deploy rischiosi, debug infinito).
- Output finale: **450–900 parole** (dipende dalla complessità del brief).
- Inserire 1 riferimento naturale a [USER_SKILLS] e 1 a [USER_ADVANTAGES] per credibilità (non in forma di lista).

---

## 3) STRUTTURA OBBLIGATORIA

### TITOLO
**Technical Architecture & Quality Assurance Protocol: [MISSION_TITLE]**

---

### SEZIONE A — SYSTEM FLOW (ASCII BLUEPRINT)
Genera un diagramma ASCII semplice e leggibile (3–9 nodi) basato su [MISSION_DESCRIPTION].  
- Se il brief riguarda UI: includi [UI] come nodo iniziale.  
- Se riguarda dati/integrazioni: includi [External Services] e [Storage].  
- Evita dettagli inutili: deve essere comprensibile in 10 secondi.

Formato consigliato (adatta i nodi al caso):
[Client/UI] -> [API/Service] -> [Business Logic] -> [Storage/DB]
                       -> [External Integrations]
                       -> [Observability/Logs]

Sotto al diagramma: 4–7 bullet con “confini” (cosa sta dove) e 1 rischio principale.

---

### SEZIONE B — SPRINT TIMELINE & DECISION POINTS
Rappresentazione obbligatoria:
`[LUN: Start] ---> [MER: Review & Fit Check] ---> [VEN: Consegna Finale]`

Spiega MER (2–4 righe):
- cosa viene mostrato (preview/staging/demo)
- cosa viene deciso (continuare / correggere rotta / ridurre scope)
- perché riduce rischio e rework

---

### SEZIONE C — REALITY CHECK (DEFINITION OF DONE)
Checklist obbligatoria: almeno **16** check, organizzati in 4 aree.  
I check devono includere esplicitamente almeno 2 riferimenti “dolore evitato” come:
- “niente pagine bianche”
- “niente crash silenziosi”
- “niente deploy da paura”
- “niente bug che tornano”

#### 1) STABILITY & ERROR HANDLING
- [ ] Errori gestiti in modo esplicito (niente crash silenziosi)
- [ ] Stati UI/risposta coerenti (niente pagine bianche o infinite loading)
- [ ] Retry/fallback dove sensato (evita failure a catena)
- [ ] Logging minimo per diagnosi rapida
- [ ] Edge cases principali coperti (input vuoti, timeout, risposte incomplete)

#### 2) SECURITY BASELINE
- [ ] Validazione input (evita injection e payload anomali)
- [ ] Gestione credenziali/config in modo sicuro (no hardcode)
- [ ] Permessi/accessi coerenti col contesto (se applicabile)
- [ ] Sanitizzazione output dove serve (evita leakage)
- [ ] Rate limiting o protezione base dove appropriato (evita abuso)

#### 3) PERFORMANCE & RELIABILITY
- [ ] Baseline performance definita (prima/dopo o soglia)
- [ ] Operazioni costose monitorate o limitate (evita colli di bottiglia)
- [ ] Caching o memoization se applicabile (evita lavoro ripetuto)
- [ ] Timeout e circuit breaker logici se applicabili (evita blocchi)
- [ ] Rilascio verificato (niente deploy da paura)

#### 4) MAINTAINABILITY & HANDOVER
- [ ] Struttura modulare e leggibile (riduce riscritture)
- [ ] Naming e convenzioni consistenti
- [ ] README minimo: run / build / test
- [ ] Config riproducibile (ambiente replicabile)
- [ ] Changelog o note di rilascio (capire cosa è cambiato)
- [ ] TODO/known issues dichiarati (trasparenza operativa)

---

### SEZIONE D — TEST & VERIFICA (EVIDENZA)
Elenca 5–10 prove di verifica, adattate a [MISSION_DESCRIPTION].  
Esempi (scegline e adatta):
- smoke test end-to-end
- test di regressione minimo su flusso critico
- test manuale guidato con checklist
- verifica log e gestione errori
- staging/demo con dati realistici

Inserire 1 frase: “Cosa considero ‘fatto’” in modo sintetico.

---

### SEZIONE E — TRASFERIMENTO DI POTERE (NO-LOCKIN)
Inserire testo obbligatorio (adatta senza cambiare il senso):

> “Alla consegna includo una guida operativa (e/o breve video) e un runbook minimo.  
> L’obiettivo è permettere al vostro team di fare modifiche in autonomia, senza dipendere da me per ogni piccola variazione.”

Chiudi con 2–3 bullet: cosa include il runbook (deploy, rollback, config, troubleshooting).

---

## AZIONE
Genera ora il **Blueprint & QA Protocol** completo per [MISSION_TITLE], basandoti su [MISSION_DESCRIPTION] e includendo un riferimento naturale a [USER_SKILLS] e [USER_ADVANTAGES].
