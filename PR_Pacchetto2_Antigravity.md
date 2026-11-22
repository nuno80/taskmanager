# PR: Pacchetto 2 — Checklist Pratica, Storico Singola Pratica e Template Precompilati

## Contesto e Obiettivo
Implementare 3 funzionalità operative 100% offline/locali sopra l'architettura attuale (post-Pacchetto 1 + hardening sicurezza):
1. **Checklist / Sotto-attività interne alla pratica** con badge avanzamento `done/tot` sulle card Kanban e gestione interattiva nella modale `#modal`.
2. **Storico completo della singola pratica** dentro `#modal` tramite navigazione a schede (`📝 Dettagli Pratica` | `📜 Cronologia (N)`), filtrando i log per codice `[N26-xxx]` o `id`.
3. **Template di pratica precompilati** (`📋 Da Template ▾`) per creare rapidamente pratiche standard (Appunto, Briefing, Coordinazione, Flash Card, Dossier) con tipologia, classifica, livello approvativo, checklist predefinita e giorni di scadenza precompilati.

---

## Vincoli Architetturali e di Sicurezza (OBBLIGATORI)
- **Zero librerie esterne, zero `type="module"`**: compatibilità diretta su `file://`, share SMB e Edge.
- **Anti-XSS rigoroso**: ogni stringa utente (`item.text`, `entry.details`, `entry.user`, ecc.) renderizzata via `innerHTML` **DEVE** passare da `escapeHtml(...)`.
- **Rispetto permessi sezione (`canEditTask`)**: se una pratica è aperta in **Sola Lettura** (`!editable`), i controlli della checklist nella modale devono essere disabilitati (`disabled`) e i pulsanti di aggiunta/rimozione voci nascosti.
- **Integrità dati e salvataggi**:
  - Mantenere `verifyNoExternalConflict(...)`, `isSavingTask`, `saveSingleTask(item, nextTasks)`, `appendAuditLog(...)` e la retrocompatibilità con pratiche esistenti prive del campo `checklist` (trattare `!Array.isArray(t.checklist)` come `[]`).
  - Riportare le stesse modifiche HTML sia in **`TaskTracker.html`** sia in **`TaskTracker_AdminSetup.html`** (lasciando intatti `window.APP_MODE` e `window.EXPECTED_DB_HINT`).
  - **Nota**: negli file allegati per analisi (`app_2.js`, `storage_2.js`, `views_2.js`) il suffisso `_2` era solo di upload; nel progetto reale i percorsi restano `assets/app.js`, `assets/storage.js`, `assets/views.js`, `assets/style.css`.

---

## Step 1 — Modifiche HTML (`TaskTracker.html` e `TaskTracker_AdminSetup.html`)

### 1.1 Pulsante Template nella Topbar
Nel blocco `<div class="top-left">`, subito dopo `<button type="button" id="btn-new-task" class="btn-add">+ Nuovo Task</button>`, aggiungere un wrapper dropdown per i template:
```html
<div style="position:relative; display:inline-block;" id="tpl-dropdown-wrap">
  <button type="button" id="btn-new-from-tpl" class="pill-ctrl" title="Crea pratica da modello precompilato">📋 Da Template ▾</button>
  <div id="popover-templates" class="popover-dropdown hidden" style="left:0; top:calc(100% + 6px); min-width:240px;">
    <div class="popover-title">Modelli Precompilati</div>
    <div id="popover-template-list"></div>
  </div>
</div>
```

### 1.2 Tab di navigazione e sezioni nella Modale Task (`#modal`)
Dentro `<div id="modal" class="modal-backdrop hidden">`, nel `<div class="modal">`:

1. Subito dopo `<div id="modal-dup-warning" class="dup-warning-box hidden"></div>`, inserire la barra tab della modale:
```html
<div class="modal-tabs" id="modal-task-tabs">
  <button type="button" class="modal-tab-btn active" data-mtab="details">📝 Dettagli Pratica</button>
  <button type="button" class="modal-tab-btn" data-mtab="history">📜 Cronologia (<span id="modal-hist-count">0</span>)</button>
</div>
```

2. Avvolgere tutti i campi attuali del form (dal primo `<div class="form-row">` fino a `<div id="t-audit-box" class="audit-footer hidden"></div>` incluso) dentro un contenitore `<div id="modal-pane-details"> ... </div>`.

3. Dentro `#modal-pane-details`, subito dopo il blocco delle Note Operative (`<textarea id="t-notes" ...></textarea></div>`) e prima di `<div id="t-audit-box"`, inserire la sezione **Checklist / Sotto-attività**:
```html
<div class="checklist-box" id="t-checklist-box">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
    <label style="color:var(--muted); font-weight:600; font-size:0.81rem;">✅ Checklist / Passaggi Interni (<span id="t-chk-summary">0/0</span>)</label>
  </div>
  <div id="t-chk-list" class="chk-list"></div>
  <div id="t-chk-add-row" style="display:flex; gap:6px; margin-top:6px;">
    <input type="text" id="t-chk-new-input" placeholder="Aggiungi passaggio (es. Visto Sezione, Firma CR, Prot.)..." style="flex:1;">
    <button type="button" id="btn-chk-add" class="std-btn" style="padding:0 12px;">+ Aggiungi</button>
  </div>
</div>
```

4. Subito dopo la chiusura di `</div>` (`#modal-pane-details`) e **prima** della barra pulsanti finale (`Verifica intermedia (-7gg) effettuata` + `Salva Pratica`), inserire il pannello della tab Cronologia:
```html
<div id="modal-pane-history" class="hidden" style="display:flex; flex-direction:column; gap:8px;">
  <div style="font-size:0.78rem; color:var(--muted);">
    Storico completo delle operazioni registrate nell'Audit Log per questa pratica.
  </div>
  <div id="modal-task-history-list" style="max-height:52vh; overflow-y:auto; border:1px solid var(--border); border-radius:8px; background:var(--surface-sub); padding:8px; display:flex; flex-direction:column; gap:6px;"></div>
</div>
```
*(Nota: assicurarsi che il footer con `Verifica intermedia` e `Salva Pratica` resti visibile sotto entrambi i tab oppure nascondere `btn-save-task` solo quando `!editable`).*

---

## Step 2 — Stili CSS (`assets/style.css`)

Aggiungere in fondo a `assets/style.css`:
```css
/* =========================================================
   PACCHETTO 2: CHECKLIST, TAB MODALE & BADGE KANBAN
   ========================================================= */
.modal-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}
.modal-tab-btn {
  background: var(--surface-sub);
  border: 1px solid var(--border);
  color: var(--muted);
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 0.79rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.14s;
}
.modal-tab-btn:hover { color: var(--text); border-color: var(--border-strong); }
.modal-tab-btn.active {
  background: var(--blue-btn);
  border-color: var(--blue-btn);
  color: #ffffff;
}

.checklist-box {
  background: var(--surface-sub);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.chk-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 170px;
  overflow-y: auto;
}
.chk-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--panel);
  border: 1px solid var(--border);
  font-size: 0.81rem;
}
.chk-item.is-done .chk-text {
  text-decoration: line-through;
  color: var(--muted);
}
.chk-del-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 2px 5px;
  border-radius: 4px;
}
.chk-del-btn:hover { background: #fee2e2; color: #dc2626; }

/* Pillola avanzamento checklist sulle card Kanban */
.k-pill.p-chk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}
.k-pill.p-chk.all-done {
  background: #16a34a;
  color: #ffffff;
}

/* Voci cronologia dentro modale */
.hist-row {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 0.79rem;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.hist-row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
```

---

## Step 3 — Rendering Checklist in Kanban (`assets/views.js`)

In `assets/views.js`, nella funzione `renderKanbanCard(t)`:
1. Calcolare il riepilogo della checklist (se presente):
   ```javascript
   const chkList = Array.isArray(t.checklist) ? t.checklist : [];
   const chkDone = chkList.filter(function(c) { return Boolean(c && c.done); }).length;
   const chkPill = chkList.length > 0
     ? '<span class="k-pill p-chk' + (chkDone === chkList.length ? ' all-done' : '') + '" title="Avanzamento passaggi interni">☑ ' + chkDone + '/' + chkList.length + '</span>'
     : '';
   ```
2. Inserire `${chkPill}` dentro `<div class="k-tags">...</div>` subito dopo `urgPill`.

---

## Step 4 — Logica Checklist, Cronologia Pratica e Template (`assets/app.js`)

### 4.1 Preset Template Precompilati
Definire una costante `TASK_TEMPLATES` in cima a `assets/app.js` (subito dopo `let editingTaskLoadedUpdatedAt = null;`):
```javascript
const TASK_TEMPLATES = [
  {
    id: 'tpl-appunto-casmd',
    label: '📝 Appunto per Ca.SMD / SCa.SMD',
    tipo: 'Appunto',
    prio: 'Urgente',
    classif: 'Riservato / NATO Restricted',
    dest: 'Ca.SMD',
    daysDue: 3,
    checklist: ['Bozza Sezione', 'Visto Capo Sezione (CS)', 'Visto CU/VCU', 'Firma CR', 'Consegna Prot./PCN']
  },
  {
    id: 'tpl-coord-interforze',
    label: '🤝 Coordinazione Inter-Ufficio',
    tipo: 'Coordinazione',
    prio: 'Ordinario',
    classif: 'Uso Ufficiale / NATO Unclassified',
    dest: 'CR',
    daysDue: 5,
    checklist: ['Analisi documento', 'Parere Sezione', 'Coordinamento Uffici', 'Approvazione CR', 'Invio risposta']
  },
  {
    id: 'tpl-briefing-nato-ue',
    label: '🎤 Briefing / Talking Points',
    tipo: 'Briefing',
    prio: 'Urgente',
    classif: 'Riservato / NATO Restricted',
    dest: 'SCa.SMD',
    daysDue: 4,
    checklist: ['Raccolta contributi', 'Stesura Talking Points', 'Verifica -7gg', 'Validazione CU', 'Consegna cartella']
  },
  {
    id: 'tpl-flash-card',
    label: '⚡ Flash Card / Punto Rapido',
    tipo: 'Flash Card',
    prio: 'Critica / Flash',
    classif: 'Uso Ufficiale / NATO Unclassified',
    dest: 'CU/VCU',
    daysDue: 1,
    checklist: ['Sintesi 1 pagina', 'Visto CS', 'Invio immediato']
  },
  {
    id: 'tpl-dossier-periodico',
    label: '📂 Dossier / Aggiornamento Periodico',
    tipo: 'Dossier',
    prio: 'Ordinario',
    classif: 'Riservato / NATO Restricted',
    dest: 'CR',
    daysDue: 10,
    checklist: ['Aggiornamento schede', 'Verifica dati PCN', 'Revisione allegati', 'Approvazione finale']
  }
];
```

### 4.2 Stato e Funzioni Checklist nella Modale
Aggiungere in `assets/app.js`:
- Variabile di stato `let modalChecklist = [];` (array di `{ text: String, done: Boolean }`).
- Funzione `renderModalChecklist(editable)`:
  - Aggiorna `#t-chk-summary` con `doneCount + '/' + modalChecklist.length`.
  - Mostra/nasconde `#t-chk-add-row` in base a `editable`.
  - Renderizza ogni voce in `#t-chk-list` con checkbox (`data-chk-toggle="<idx>"`, `disabled` se `!editable`), testo escapato con `escapeHtml(item.text)` e pulsante rimozione (`data-chk-del="<idx>"`, solo se `editable`).
  - Se `modalChecklist.length === 0`, mostra `<div style="font-size:0.76rem; color:var(--muted); font-style:italic;">Nessun passaggio interno definito.</div>`.
- Funzione `addChecklistItemFromInput()`:
  - Legge `#t-chk-new-input`, fa `.trim()`, se non vuoto esegue `modalChecklist.push({ text: val, done: false })`, svuota l'input e richiama `renderModalChecklist(true)`.
- Nel salvataggio (`saveTask()`):
  - Includere `checklist: modalChecklist.map(function(c) { return { text: String(c.text || '').trim(), done: Boolean(c.done) }; }).filter(function(c) { return c.text; })` dentro `item`.
  - Nel calcolo `diffs` (quando `oldTask` esiste), confrontare anche il conteggio checklist (`oldDone + '/' + oldTot` vs `newDone + '/' + newTot`) e aggiungere `'Checklist: ' + oldDone + '/' + oldTot + ' → ' + newDone + '/' + newTot` se cambiato.

### 4.3 Tab Cronologia Singola Pratica dentro `#modal`
Aggiungere in `assets/app.js`:
- Funzione `setModalTab(tabName)` (`'details'` | `'history'`):
  - Attiva/disattiva `.active` sui pulsanti `[data-mtab]` in `#modal-task-tabs`.
  - Mostra `#modal-pane-details` se `tabName === 'details'`, oppure `#modal-pane-history` se `tabName === 'history'`.
- Funzione `async function loadAndRenderTaskHistory(taskObj)`:
  - Se `!taskObj`: imposta `#modal-hist-count` a `'0'` e mostra `"Salva prima la pratica per registrarne la cronologia."` in `#modal-task-history-list`.
  - Se `taskObj` esiste:
    1. Se `storageMode === 'fs' && logs.length === 0`, chiama `await syncAllFromStorage(true, false)` per assicurarsi che i log su disco siano caricati.
    2. Filtra `logs` cercando le voci in cui `l.target` contiene `'[' + taskObj.code + ']'` (oppure `l.taskId === taskObj.id`).
    3. Aggiorna `#modal-hist-count` con il numero di voci trovate.
    4. Renderizza le voci in `#modal-task-history-list` usando `escapeHtml(...)` per `l.user`, `l.sec`, `l.action`, `l.details` e `formatTimestamp(l.ts)`.
  - In `appendAuditLog(action, sec, targetTitle, details)` in `assets/storage.js`, non serve rompere la firma: le voci esistenti hanno già `'[' + item.code + '] ' + item.title` in `target`, quindi il filtro per `'[' + taskObj.code + ']'` funziona retroattivamente su tutti i log già salvati!

### 4.4 Aggiornamento `openModal(id, templatePreset)`
Estendere `openModal(id, templatePreset)` in `assets/app.js`:
- Resettare sempre la tab attiva su `'details'` chiamando `setModalTab('details')`.
- Se `t` esiste:
  - Caricare `modalChecklist = Array.isArray(t.checklist) ? t.checklist.map(function(c) { return { text: String(c.text || ''), done: Boolean(c.done) }; }) : [];`
  - Chiamare `renderModalChecklist(editable)` e `loadAndRenderTaskHistory(t)`.
- Se `!t` (nuova pratica):
  - Se `templatePreset` è passato:
    - Popolare `#t-tipo` (`templatePreset.tipo`), `#t-prio` (`templatePreset.prio`), `#t-class` (`templatePreset.classif`), `#t-dest` (`templatePreset.dest`).
    - Calcolare la data scadenza `#t-date` sommando `templatePreset.daysDue` giorni a oggi (`toISODateLocal(new Date(Date.now() + templatePreset.daysDue * 86400000))`).
    - Popolare `modalChecklist = (templatePreset.checklist || []).map(function(txt) { return { text: txt, done: false }; });`
    - Impostare `#modal-title` a `'Nuova Pratica — ' + templatePreset.label.replace(/^[^\wÀ-ÿ]+/, '')`.
  - Altrimenti: `modalChecklist = [];`.
  - Chiamare `renderModalChecklist(true)` e `loadAndRenderTaskHistory(null)`.

### 4.5 Event Listeners in `initApp()` (`assets/app.js`)
1. **Dropdown Template (`#btn-new-from-tpl` e `#popover-templates`)**:
   - Popolare `#popover-template-list` con i pulsanti/voci di `TASK_TEMPLATES` (`<div class="popover-item" data-tpl-id="...">...</div>`).
   - Click su `#btn-new-from-tpl`: toggle `.hidden` su `#popover-templates` (con `e.stopPropagation()`).
   - Click su `[data-tpl-id]`: chiude il popover, trova il template in `TASK_TEMPLATES` e chiama `openModal(null, tpl)`.
   - Chiudere `#popover-templates` al click esterno sul `document` (come già fatto per `#popover-years`).
2. **Tab Modale (`#modal-task-tabs`)**:
   - Click delegato su `[data-mtab]`: chiama `setModalTab(btn.getAttribute('data-mtab'))`.
3. **Checklist nella Modale**:
   - Click su `#btn-chk-add` o `Enter` su `#t-chk-new-input`: chiama `addChecklistItemFromInput()`.
   - Change delegato su `#t-chk-list` (`[data-chk-toggle]`): inverte `modalChecklist[idx].done` e richiama `renderModalChecklist(true)`.
   - Click delegato su `#t-chk-list` (`[data-chk-del]`): rimuove `modalChecklist.splice(idx, 1)` e richiama `renderModalChecklist(true)`.

---

## Criteri di Verifica (Test Obbligatori)
1. **Template precompilati**: cliccando `📋 Da Template ▾` → `Appunto per Ca.SMD`, la modale si apre con Tipologia=`Appunto`, Approvatore=`Ca.SMD`, scadenza a `+3 giorni` e 5 voci già pronte nella checklist.
2. **Checklist & Kanban**: aggiungendo/spuntando voci nella checklist e salvando, sulla card Kanban appare il badge `☑ X/Y` (verde quando `X === Y`), persistito nel file JSON della pratica.
3. **Permessi Sola Lettura**: aprendo una pratica di un'altra sezione come utente non-admin, le checkbox della checklist sono `disabled` e non è possibile aggiungere o rimuovere voci.
4. **Tab Cronologia nella modale**: modificando stato o scadenza di una pratica e riaprendola sulla tab `📜 Cronologia (N)`, compaiono tutte le operazioni storiche di quella specifica pratica in ordine cronologico inverso.
5. **Allineamento file e sintassi**: `TaskTracker.html` e `TaskTracker_AdminSetup.html` entrambi aggiornati; `node --check` su `assets/storage.js`, `assets/views.js`, `assets/app.js` senza errori; zero errori JS in console.
