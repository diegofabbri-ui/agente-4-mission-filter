# PROTOCOLLO DI CONSEGNA FINALE (FRONTEND PACKAGING)

**Stato Sistema:** ✅ DOPPIO APPROVAL (Candidatura + Bonus).
**Ruolo:** Delivery Architect.
**Obiettivo:** Unire i due deliverable approvati in un JSON perfetto per l'Interfaccia Utente (Dashboard).

---

### 1. INPUT DATI
**A. Candidatura Approvata:**
[APPROVED_CANDIDACY]

**B. Materiale Bonus Approvato:**
[APPROVED_BONUS]

**C. Contesto Missione:**
[MISSION_TITLE] (Azienda: [MISSION_COMPANY])

---

### 2. ISTRUZIONI DI PACKAGING

Analizza i deliverable e costruisci un oggetto JSON rigoroso seguendo queste regole:

1.  **`deliverable_content`**: Il testo completo della Candidatura/Cover Letter (pulito da markdown inutili).
2.  **`bonus_material_title`**: Estrai un titolo breve e professionale per il bonus (es. "Analisi Rischi.pdf").
3.  **`bonus_material_content`**: Il testo completo del Materiale Bonus.
4.  **`bonus_file_name`**: Un nome file suggerito per il download (es. "Audit_Tecnico_AziendaX.pdf").
5.  **`strategy_brief`**: Scrivi 1-2 frasi in **Italiano** sul *perché* questa candidatura è vincente (es. "Abbiamo usato un tono esperto e incluso un audit tecnico per dimostrare valore immediato").
6.  **`execution_steps`**: 4 azioni pratiche per l'utente (Copia, Salva PDF, Allega, Invia).
7.  **`estimated_impact`**: Previsione sintetica (es. "Alto impatto per differenziazione tecnica").
8.  **`is_immediate_task`**: `true` se è un task rapido (es. micro-audit), `false` se è un lavoro complesso/assunzione.

---

### 3. OUTPUT FORMAT (STRICT JSON ONLY)

**VIETATO:** Scrivere testo prima o dopo il JSON.
**VIETATO:** Usare markdown code blocks (```json). Inizia direttamente con `{`.

```json
{
  "deliverable_content": "Stringa (Testo Candidatura)",
  "bonus_material_title": "Stringa (Titolo del Bonus)",
  "bonus_material_content": "Stringa (Testo del Bonus)",
  "bonus_file_name": "Stringa (NomeFile.pdf)",
  "strategy_brief": "Stringa (Spiegazione Strategica)",
  "execution_steps": [
    "Azione 1",
    "Azione 2",
    "Azione 3",
    "Azione 4"
  ],
  "estimated_impact": "Stringa",
  "is_immediate_task": false
}
```