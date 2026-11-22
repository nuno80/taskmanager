# PR: Pacchetto 3 — Duplica Pratica, Azioni Batch in Tabella e KPI Operativi (Tempi Medi & Puntualità)

## Contesto e Obiettivo
Implementare 3 funzionalità 100% offline/locali sopra l'architettura attuale (post-Pacchetto 1 e Pacchetto 2):
1. **Pulsante "📋 Duplica Pratica"** nella modale `#modal`: crea rapidamente una copia in bozza di una pratica esistente (nuovo codice progressivo automatico, azzeramento ATO/Protocollo/date PCN/scadenza, reset checklist a `done: false`).
2. **Azioni Multiple (Batch) nella Vista Tabella (`#view-list`)**: selezione tramite checkbox di più pratiche modificabili per cambiare Stato, spostare la Scadenza o spostarle nel Cestino (Soft Delete) in un'unica operazione sicura.
3. **KPI Operativi nelle Statistiche (`#view-stats`)**: aggiunta del timestamp `completedAt` al completamento e calcolo di 3 nuove metriche operative (**Tempo Medio di Evasione**, **Giacenza Media Prot./PCN**, **Tasso di Puntualità**).

---

## Vincoli Architetturali e di Sicurezza (OBBLIGATORI)
- **Zero librerie esterne, zero `type="module"`**: compatibilità diretta su `file://`, share SMB e Edge.
- **Anti-XSS rigoroso**: ogni stringa utente inserita in `innerHTML` **DEVE** passare da `escapeHtml(...)` e le sezioni da `sanitizeSection(...)`.
- **Rispetto permessi (`canEditTask`)**:
  - In tabella, le checkbox delle pratiche di altre sezioni (non modificabili dall'utente corrente) devono essere `disabled` e ignorate dal "Seleziona tutto".
  - Nelle azioni batch, verificare sempre `canEditTask(t)` su ogni singolo elemento prima della scrittura.
- **Guardia SMB (`isSavingTask`)**: ogni operazione batch deve essere avvolta in un unico blocco `isSavingTask = true; try { ... } finally { isSavingTask = false; }` con scritture sequenziali (`for ... await saveSingleTask(...)`), evitando qualsiasi collisione col sync dei 15s.
- **Allineamento HTML**: applicare le **identiche modifiche HTML** sia a `TaskTracker.html` sia a `TaskTracker_AdminSetup.html` (senza toccare `window.APP_MODE` né `window.EXPECTED_DB_HINT`).

---

## Step 1 — Modifiche HTML (`TaskTracker.html` e `TaskTracker_AdminSetup.html`)

### 1.1 Barra Azioni Batch e colonna Checkbox in Tabella (`#view-list`)
1. Dentro `<div id="view-list" class="hidden">`, **subito sopra** `<table>`, inserire la barra batch:
```html
<div id="batch-action-bar" class="batch-bar hidden">
  <span class="batch-count"><b id="batch-sel-count">0</b> pratiche selezionate</span>
  <div class="batch-controls">
    <select id="batch-status-select" class="pill-ctrl" title="Nuovo stato per le pratiche selezionate">
      <option value="">Cambia Stato...</option>
      <option value="Da iniziare">Da iniziare</option>
      <option value="In lavorazione">In lavorazione</option>
      <option value="In verifica intermedia">In verifica intermedia</option>
      <option value="Pronto per consegna">Pronto per consegna</option>
      <option value="Completato">Completato</option>
      <option value="Annullato">Annullato</option>
    </select>
    <button type="button" id="btn-batch-apply-status" class="std-btn btn-primary" style="padding:5px 10px;">Applica Stato</button>
    <input type="date" id="batch-date-input" class="pill-ctrl" title="Nuova scadenza per le pratiche selezionate">
    <button type="button" id="btn-batch-apply-date" class="std-btn btn-primary" style="padding:5px 10px;">Sposta Scadenza</button>
    <button type="button" id="btn-batch-delete" class="std-btn btn-danger" style="padding:5px 10px;">🗑️ Cestino</button>
    <button type="button" id="btn-batch-clear" class="std-btn" style="padding:5px 10px;">✕ Annulla</button>
  </div>
</div>
```

2. Dentro `<table><thead><tr>` di `#view-list`, aggiungere come **prima colonna** `<th>`:
```html
<th style="width:32px; text-align:center;"><input type="checkbox" id="tbl-select-all" title="Seleziona/Deseleziona tutte le pratiche modificabili"></th>
```

### 1.2 Seconda riga KPI Operativi in `#view-stats`
Dentro `<div id="view-stats" class="hidden">`, subito dopo `<div class="stats-kpi-grid" id="stats-kpis"></div>`, aggiungere:
```html
<div class="stats-kpi-grid stats-kpi-ops" id="stats-kpis-ops"></div>
```

### 1.3 Pulsante "📋 Duplica" nella Modale Task (`#modal`)
Nel footer di `#modal`, accanto a `<button type="button" id="btn-delete-in-modal" ...>`, aggiungere:
```html
<button type="button" id="btn-duplicate-in-modal" class="std-btn hidden" title="Crea una nuova pratica copiando i dati di questa">📋 Duplica</button>
```

---

## Step 2 — Stili CSS (`assets/style.css`)

Aggiungere in fondo a `assets/style.css`:
```css
/* =========================================================
   PACCHETTO 3: BARRA BATCH TABELLA & KPI OPERATIVI
   ========================================================= */
.batch-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  background: var(--today-bg);
  border: 1px solid var(--today-border);
  border-radius: 10px;
  padding: 9px 14px;
  margin-bottom: 10px;
  font-size: 0.82rem;
}
.batch-count {
  color: var(--today-text);
  font-weight: 600;
}
.batch-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.stats-kpi-ops {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 900px) {
  .stats-kpi-ops { grid-template-columns: minmax(0, 1fr); }
}
```
Inoltre, nella regola `@media print` esistente in `assets/style.css`, aggiungere `.batch-bar` all'elenco degli elementi nascosti in stampa (`display: none !important;`).

---

## Step 3 — Tabella Checkbox, Batch UI e KPI Operativi (`assets/views.js`)

### 3.1 Stato selezione Batch
Vicino alle variabili di stato in cima a `assets/views.js` (sotto `let sortDirection = 'asc';`), aggiungere:
```javascript
let selectedTaskIds = new Set();
```

### 3.2 Aggiornamento `renderTable(list)` e helper `updateBatchBarUI(visibleList)`
1. Aggiungere helper `function updateBatchBarUI(visibleList)`:
   - Calcola `editableVisibleIds`: gli `id` delle pratiche in `visibleList` (o `getFilteredTasks()` se non passato) per cui `canEditTask(t)` è `true`.
   - Rimuove da `selectedTaskIds` eventuali `id` che non sono più presenti in `tasks` o non sono più modificabili.
   - Mostra `#batch-action-bar` se `selectedTaskIds.size > 0`, altrimenti aggiunge `.hidden`.
   - Aggiorna `#batch-sel-count` con `selectedTaskIds.size`.
   - Aggiorna `#tbl-select-all`: `checked = editableVisibleIds.length > 0 && editableVisibleIds.every(id => selectedTaskIds.has(id))`, `indeterminate = !checked && editableVisibleIds.some(id => selectedTaskIds.has(id))`.
2. In `renderTable(list)`:
   - Aggiungere come **prima cella `<td>`** di ogni `<tr>`:
     ```javascript
     '<td style="text-align:center;"><input type="checkbox" class="tbl-row-chk" data-chk-id="' + safeId + '"' + (selectedTaskIds.has(t.id) ? ' checked' : '') + (editable ? '' : ' disabled title="Sola lettura (altra sezione)"') + '></td>'
     ```
   - Alla fine di `renderTable(list)`, chiamare `updateBatchBarUI(list);`.

### 3.3 KPI Tempi Medi & Puntualità in `renderStats()`
Dentro `renderStats()` in `assets/views.js`, dopo il popolamento di `#stats-kpis`, calcolare i 3 KPI operativi su `subset` e renderizzarli in `#stats-kpis-ops`:
1. **Tempo Medio Evasione (giorni):**
   - Considera le pratiche di `subset` con `status` che inizia per `'completat'`.
   - Data inizio: `t.insDate || (t.createdAt ? t.createdAt.slice(0, 10) : '')`.
   - Data fine: `(t.completedAt ? t.completedAt.slice(0, 10) : '') || (t.updatedAt ? t.updatedAt.slice(0, 10) : '')`.
   - Se entrambe valide (`!isNaN(dStart)` e `!isNaN(dEnd)` e `dEnd >= dStart`), somma `(dEnd - dStart) / 86400000` e incrementa `evasionCount`.
   - Media: `evasionCount > 0 ? (evasionSum / evasionCount).toFixed(1).replace('.', ',') + ' gg' : '—'`.
2. **Giacenza Media Prot./PCN (giorni):**
   - Considera le pratiche di `subset` con sia `t.pcnOut` sia `t.pcnIn` compilati e `dIn >= dOut`.
   - Somma `(dIn - dOut) / 86400000` e incrementa `pcnDoneCount`.
   - Calcola anche `pcnWaitingCount`: pratiche non chiuse di `subset` con `t.pcnOut && !t.pcnIn`.
   - Media: `pcnDoneCount > 0 ? (pcnSum / pcnDoneCount).toFixed(1).replace('.', ',') + ' gg' : '—'`.
   - Sottotitolo: `pcnDoneCount + ' rientrate • ' + pcnWaitingCount + ' in attesa PCN'`.
3. **Tasso di Puntualità (%):**
   - Considera le pratiche di `subset` con `status` che inizia per `'completat'` **e** con `t.date` (scadenza) valorizzata.
   - Data chiusura ISO (`YYYY-MM-DD`): `(t.completedAt ? t.completedAt.slice(0, 10) : '') || (t.updatedAt ? t.updatedAt.slice(0, 10) : '')`.
   - Se `closeDateISO && closeDateISO <= t.date`, incrementa `onTimeCount`.
   - Percentuale: `punctBase > 0 ? Math.round((onTimeCount / punctBase) * 100) + '%' : '—'`.
   - Sottotitolo: `punctBase > 0 ? (onTimeCount + ' su ' + punctBase + ' entro scadenza') : 'Nessuna completata con scadenza'`.
4. Renderizzare le 3 card in `#stats-kpis-ops` usando la stessa struttura `.kpi-card` (`border-top-color`: `#0ea5e9` per Evasione, `#f59e0b` per PCN, `#10b981` per Puntualità).

---

## Step 4 — Logica `completedAt`, Duplica Pratica e Azioni Batch (`assets/app.js`)

### 4.1 Tracciamento `completedAt`
Aggiungere un piccolo helper in `assets/app.js`:
```javascript
function computeCompletedAt(oldTask, newStatus, nowISO) {
  const isNowDone = String(newStatus || '').trim().toLowerCase().startsWith('completat');
  if (!isNowDone) return '';
  if (oldTask && oldTask.completedAt) return oldTask.completedAt;
  return nowISO;
}
```
Usarlo in **3 punti**:
1. **`saveTask()`**: aggiungere `completedAt: computeCompletedAt(oldTask, document.getElementById('t-status').value, nowISO)` dentro `item`.
2. **Drag & Drop Kanban (modalità "Per Stato")**: aggiungere `completedAt: computeCompletedAt(t, newStatus, nowISO)` dentro `updated`.
3. **Batch Cambio Stato (`applyBatchStatus()`)**: aggiungere `completedAt: computeCompletedAt(t, newStatus, nowISO)` dentro `updated`.

### 4.2 Funzione "📋 Duplica Pratica"
1. In `openModal(id, templatePreset)`:
   - Mostrare `#btn-duplicate-in-modal` solo quando `Boolean(t)` (pratica esistente aperta, anche se in sola lettura così un utente può duplicare una pratica di un'altra sezione dentro la propria).
2. Nuova funzione `function duplicateCurrentModalTask()`:
   - Legge l'id da `#t-id`. Trova `orig` in `tasks`. Se `!orig`, termina.
   - Determina la sezione della copia: se `currentUser.role === 'admin'` mantiene `sanitizeSection(orig.sec)`, altrimenti imposta `sanitizeSection(currentUser.sec)`.
   - Prepara la modale in **modalità nuova pratica**:
     - `editingTaskLoadedUpdatedAt = null;`
     - `#t-id = ''`, `#t-code = ''`
     - `#modal-title` = `'Nuova Pratica (Copia di ' + (orig.code || 'Pratica') + ')'`
     - `#modal-readonly-tag` nascosto, `#btn-save-task` visibile, `#btn-delete-in-modal` nascosto, `#btn-duplicate-in-modal` nascosto, `#t-audit-box` nascosto.
     - Abilita tutti i campi editabili (mantenendo `#t-sec` disabilitato se `!isAdmin`).
     - Mantiene: `#t-sec` (calcolato sopra), `#t-tipo`, `#t-prio`, `#t-class`, `#t-dest`, `#t-notes`, `#t-link`.
     - Imposta `#t-title` = `(orig.title || '') + ' (Copia)'`.
     - Azzera: `#t-ato = ''`, `#t-prot = ''`, `#t-pcn-out = ''`, `#t-pcn-in = ''`, `#t-date = ''`, `#t-time = '12:00'`, `#t-mid-done.checked = false`.
     - Imposta `#t-ins-date = toISODateLocal(new Date())`, `#t-status = 'Da iniziare'`.
     - Copia la checklist con tutte le voci deselezionate:
       `modalChecklist = Array.isArray(orig.checklist) ? orig.checklist.map(function(c) { return { text: String(c.text || ''), done: false }; }) : [];`
     - Chiama `renderModalChecklist(true)`, `setModalTab('details')`, `loadAndRenderTaskHistory(null)`, `updateCodePreviewForNewTask()`, `updateModalDuplicateWarning()`.
     - Mostra `showToast('📋 Pratica duplicata in bozza: verifica i campi e premi Salva')`.

### 4.3 Funzioni Azioni Multiple (Batch) in Tabella
Aggiungere in `assets/app.js`:
1. `async function applyBatchStatus()`:
   - Legge `newStatus = document.getElementById('batch-status-select').value`. Se vuoto, `alert('Seleziona uno stato da applicare.')` e termina.
   - Raccoglie le pratiche valide in `tasks` il cui `id` è in `selectedTaskIds` e `canEditTask(t)` è `true`. Se 0, termina.
   - Chiede conferma: `confirm('Aggiornare lo stato a "' + newStatus + '" per ' + targets.length + ' pratiche selezionate?')`.
   - Con `isSavingTask = true; try { ... } finally { isSavingTask = false; }`:
     - Per ogni `t` in `targets`: crea `updated` con `status: newStatus`, `completedAt: computeCompletedAt(t, newStatus, nowISO)`, `updatedBy`, `updatedAt`; aggiorna `nextTasks` e chiama `await saveSingleTask(updated, nextTasks)`; registra log `MODIFICATO` (in `try/catch`).
     - Aggiorna `tasks = nextTasks`.
   - Svuota `selectedTaskIds.clear()`, resetta `#batch-status-select.value = ''`, chiama `populateYearLists(); render(); showToast('✓ Stato aggiornato su ' + targets.length + ' pratiche');`.
2. `async function applyBatchDate()`:
   - Legge `newDate = document.getElementById('batch-date-input').value`. Se vuoto, `alert('Seleziona una data di scadenza.')` e termina.
   - Stesso pattern sicuro di `applyBatchStatus()` con `confirm(...)`, guardia `isSavingTask`, aggiornamento `date: newDate`, `updatedBy`, `updatedAt`, log `SPOSTATO` per ogni pratica, pulizia `selectedTaskIds` e toast finale.
3. `async function applyBatchSoftDelete()`:
   - Raccoglie le pratiche modificabili selezionate. Se 0, termina.
   - Chiede conferma: `confirm('Spostare nel Cestino ' + targets.length + ' pratiche selezionate? (L\'Amministratore potrà ripristinarle)')`.
   - Con `isSavingTask = true; try { ... } finally { isSavingTask = false; }`:
     - Per ogni `t` in `targets`: imposta `t.deleted = true; t.deletedBy = ...; t.deletedAt = nowISO;`, sposta `t` da `tasks` a `deletedTasks`, chiama `await saveSingleTask(t, tasks.concat(deletedTasks))`, registra log `ELIMINATO` (in `try/catch`).
   - Svuota `selectedTaskIds.clear()`, chiama `populateYearLists(); render(); showToast('🗑️ ' + targets.length + ' pratiche spostate nel Cestino');`.

### 4.4 Event Listeners in `initApp()` (`assets/app.js`)
1. `#btn-duplicate-in-modal` → `click` → `duplicateCurrentModalTask`.
2. `#tbl-select-all` → `change`:
   - Calcola le pratiche attualmente visibili e modificabili (`getFilteredTasks().filter(canEditTask)`).
   - Se `checked`, aggiunge tutti i loro `id` a `selectedTaskIds`; altrimenti li rimuove.
   - Richiama `renderTable(getFilteredTasks())`.
3. `#table-body` → `change` delegato su `.tbl-row-chk`:
   - Legge `id = chk.getAttribute('data-chk-id')`.
   - Aggiunge o rimuove `id` da `selectedTaskIds` e chiama `updateBatchBarUI(getFilteredTasks())`.
4. `#btn-batch-apply-status` → `applyBatchStatus`.
5. `#btn-batch-apply-date` → `applyBatchDate`.
6. `#btn-batch-delete` → `applyBatchSoftDelete`.
7. `#btn-batch-clear` → `selectedTaskIds.clear(); renderTable(getFilteredTasks());`.

---

## Criteri di Verifica (Test Obbligatori)
1. **Duplica Pratica**:
   - Aprire una pratica esistente con checklist spuntata, ATO, protocollo e date PCN → cliccare `📋 Duplica`.
   - Verificare: `#t-id` vuoto, anteprima nuovo codice progressivo, ATO/Prot./PCN/scadenza azzerati, stato `Da iniziare`, checklist copiata con tutte le spunte azzerate (`0/N`).
   - Salvare → la nuova pratica viene creata senza sovrascrivere l'originale.
2. **Azioni Batch in Tabella**:
   - Passare alla vista Tabella, selezionare 2 pratiche → appare `#batch-action-bar` con `2 pratiche selezionate`.
   - Applicare cambio stato a `Completato` → entrambe salvate su disco con `completedAt` valorizzato, `isSavingTask` torna `false`, selezione azzerata, toast mostrato.
   - Testare `Sposta Scadenza` e `🗑️ Cestino` (verificando che le pratiche finiscano nel Cestino Admin e non vengano cancellate irreversibilmente).
   - Come utente non-admin, verificare che le checkbox delle pratiche di altre sezioni siano `disabled` e non selezionabili con `Seleziona tutto`.
3. **KPI Operativi nelle Statistiche**:
   - Aprire `📊 Statistiche` → verificare la seconda riga con le 3 card (**Tempo Medio Evasione**, **Giacenza Media Prot./PCN**, **Tasso di Puntualità**) con valori coerenti sui dati di test e gestione pulita del caso `—` quando non ci sono pratiche completate.
4. **Allineamento file & Sintassi**:
   - Verificare che sia `TaskTracker.html` sia `TaskTracker_AdminSetup.html` contengano le stesse aggiunte HTML.
   - Eseguire `node --check assets/storage.js assets/views.js assets/app.js` — zero errori.
   - Verificare zero errori JS in Console e rimuovere eventuali dati/server temporanei di test.