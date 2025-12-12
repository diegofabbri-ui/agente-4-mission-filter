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
- Tecnologia specifica **solo** se presente in [MISSION_DESCRIPTION]; altrimenti usare termini generici (UI, backend, servizi, dati, integrazioni).
- Linguaggio pratico: ogni check deve parlare di **dolore evitato** (regressioni, pagine bianche, crash, deploy rischiosi, debug infinito).
- Output finale: **450–900 parole**.
- Inserire 1 riferimento naturale a [USER_SKILLS] e 1 a [USER_ADVANTAGES] per credibilità (non in forma di lista).
- Vietato includere “stack consigliato”: descrivere sempre “coerente con lo stack attuale/brief”.

---

## 3) STRUTTURA OBBLIGATORIA

### TITOLO
**Technical Architecture & Quality Assurance Protocol: [MISSION_TITLE]**

---

### SEZIONE A — SYSTEM FLOW (ASCII BLUEPRINT)
Genera un diagramma ASCII semplice e leggibile (3–9 nodi) basato su [MISSION_DESCRIPTION].  
Deve essere comprensibile in 10 secondi, senza dettagli inutili.

Formato consigliato (adatta i nodi al caso):
[Client/UI] -> [API/Service] -> [Business Logic] -> [Storage/DB]
                       -> [External Integrations / Agents]
                       -> [Observability / Logs]

Sotto al diagramma:
- 4–7 bullet sui confini (cosa sta dove)
- 1 rischio principale (es. coupling eccessivo) + 1 mitigazione (contratti API, separazione responsabilità)

---

### SEZIONE B — SPRINT TIMELINE & DECISION POINTS
Rappresentazione obbligatoria:
`[LUN: Start] ---> [MER: Review & Decision Gate] ---> [VEN: Consegna Finale]`

Spiega MER (2–4 righe):
- cosa viene mostrato (preview/staging/demo)
- cosa viene deciso: **continuiamo / correggiamo rotta / riduciamo scope**
- perché riduce rischio e rework

---

### SEZIONE C — REALITY CHECK (DEFINITION OF DONE)
Checklist obbligatoria: almeno **16** check, organizzati in 4 aree, con dolore evitato esplicito.

#### 1) STABILITY & ERROR HANDLING
- [ ] Errori gestiti in modo esplicito (niente crash silenziosi)
- [ ] Stati UI/API sempre definiti (niente pagine bianche o infinite loading)
- [ ] Retry/fallback dove sensato (evita failure a catena)
- [ ] Logging minimo per diagnosi rapida
- [ ] Edge cases principali coperti

#### 2) SECURITY BASELINE
- [ ] Validazione input
- [ ] Gestione credenziali/config sicura (no hardcode)
- [ ] Permessi/accessi coerenti (se applicabile)
- [ ] Sanitizzazione output dove serve
- [ ] Rate limiting/protezioni base se richieste dal contesto

#### 3) PERFORMANCE & RELIABILITY
- [ ] Baseline performance definita (soglie o proxy)
- [ ] Operazioni costose monitorate/limitate
- [ ] Timeout e fallback su dipendenze esterne (se applicabile)
- [ ] Deploy verificato (niente deploy da paura)
- [ ] Stabilità in condizioni degradate (graceful degradation)

#### 4) MAINTAINABILITY & HANDOVER
- [ ] Architettura modulare e leggibile
- [ ] Naming e convenzioni consistenti
- [ ] README minimo: run/build/test
- [ ] Config replicabile
- [ ] Changelog o note di rilascio
- [ ] Known issues dichiarati

---

### SEZIONE D — TEST & VERIFICA (EVIDENZA)
Elenca 5–10 prove di verifica coerenti con [MISSION_DESCRIPTION] (scegli e adatta):
- smoke test end-to-end
- regressione su flusso critico
- edge case check
- controllo log/error handling
- integrazioni/agents check (se presenti)
- performance sanity check
- storage/data integrity check (se applicabile)

Chiudi con 1 riga: “Cosa considero ‘fatto’” (criterio verificabile).

---

### SEZIONE E — TRASFERIMENTO DI POTERE (NO-LOCKIN)
Inserire testo obbligatorio:

> “Alla consegna includo un runbook minimo (deploy, rollback, config, troubleshooting) e test essenziali.  
> L’obiettivo è permettere al vostro team di lavorare in autonomia, senza dipendere da me per ogni piccola variazione.”

---

## AZIONE
Genera ora il **Blueprint & QA Protocol** completo per [MISSION_TITLE], basandoti su [MISSION_DESCRIPTION] e includendo un riferimento naturale a [USER_SKILLS] e [USER_ADVANTAGES].

