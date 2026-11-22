# PR: Pacchetto 1 — Punto di Situazione (Word/Outlook/Stampa), Filtri Rapidi 1-clic, Cestino (Soft Delete) & Backup Completo JSON

## Contesto e Vincoli Rigidi (LEGGERE PRIMA DI INIZIARE)
- **Architettura Standalone:** Applicazione web 100% offline/LAN in vanilla JS senza bundler, senza librerie esterne e senza `type="module"`.
- **Ordine di Caricamento Script Invariato:** `assets/storage.js` → `assets/views.js` → `assets/app.js`.
- **Sincronizzazione HTML Doppia:** Se nella cartella del progetto sono presenti sia `TaskTracker.html` sia `TaskTracker_AdminSetup.html`, applicare le **identiche modifiche HTML** a entrambi i file.
- **Sincronizzazione Incrementale & Cache (`taskFileCache`):** L'applicazione utilizza una cache incrementale in memoria (`Map` in `assets/storage.js` indicizzata per nome file con `lastModified`, `size` e `task`) e la firma `syncAllFromStorage(includeLogs, forceRender)`. Tutte le nuove operazioni su file (Soft Delete, Ripristino, Eliminazione definitiva, Ripristino backup) devono mantenere allineata `taskFileCache`.
- **Controllo Conflitti Ottimistico:** Ogni operazione di modifica o spostamento nel Cestino deve verificare preventivamente la data di modifica su disco tramite `verifyNoExternalConflict(taskId, expectedUpdatedAt, false)` prima di procedere.
- **Sicurezza Scritture LAN/SMB (`isSavingTask`):** Ogni operazione di scrittura o cancellazione file su disco (`saveSingleTask`, `deleteSingleTaskFile`, `saveUsersToStorage`, ripristino backup) deve essere rigorosamente protetta da:
  ```javascript
  isSavingTask = true;
  try {
    // Scrittura file + audit log
  } finally {
    isSavingTask = false;
  }
  ```
- **Selettori UI Allineati:** La barra laterale unificata utilizza le classi `.app-rail`, `.rail-group`, `.rail-item`, `.rail-footer` (non più le vecchie classi `.sidebar` o `.tool-rail`). Il filtro sezioni principale è l'elemento `<select id="f-sec">` nella topbar (non più `#sb-sec-list`).
- **Retrocompatibilità Totale:** Non rimuovere né alterare le funzionalità esistenti (codici `N26-xxx`, IndexedDB reconnect, Drag & Drop Kanban/Calendario, controllo duplicati, gestione PIN esistenti, audit log).

---

## PARTE A — Cestino (Soft Delete) e Backup Completo JSON (Admin)

### Scelta Architetturale Obbligatoria
Non spostare i file in una sottocartella `trash/` (sulle share di rete SMB l'API `FileSystemAccess` non fornisce un `move()` atomico affidabile). Viene invece impiegato il **Soft Delete nel JSON**:
- Una pratica eliminata rimane salvata nel proprio file `tasks/<id>.json`, integrando i metadati:
  ```json
  "deleted": true,
  "deletedBy": "Nome Operatore (Sezione)",
  "deletedAt": "2026-11-22T10:30:00.000Z"
  ```
- In memoria (`assets/storage.js`), separare nettamente i due array:
  - `tasks`: contiene **esclusivamente** le pratiche attive (`!obj.deleted`). In questo modo tutte le viste esistenti (Kanban, Tabella, Calendario, Statistiche, Notifiche, Ricerca) continuano a operare senza modifiche dispersive.
  - `deletedTasks`: nuovo array globale che contiene **esclusivamente** le pratiche con `obj.deleted === true`.

### 1. Modifiche a `assets/storage.js`
1. **Dichiarazione stato globale (accanto a `let tasks = [], users = [], logs = [];`):**
   ```javascript
   let deletedTasks = [];
   ```
2. **In `resetFsHandles()`:**
   - Aggiungere `deletedTasks = [];`.
3. **In `syncAllFromStorage(includeLogs, forceRender)`:**
   - **Modalità `fs`:**
     - Durante la lettura e il popolamento da `taskFileCache`, separare gli elementi:
       ```javascript
       const loadedActive = [];
       const loadedDeleted = [];
       taskFileCache.forEach(function(entry) {
         if (entry && entry.task) {
           if (entry.task.deleted) loadedDeleted.push(entry.task);
           else loadedActive.push(entry.task);
         }
       });
       ```
     - Eseguire il controllo e completamento codici sull'unione di entrambi gli array, così nessun codice cestinato viene mai riutilizzato:
       ```javascript
       const backfilled = backfillMissingCodes(loadedActive.concat(loadedDeleted));
       tasks = loadedActive;
       deletedTasks = loadedDeleted;
       ```
   - **Modalità `local`:**
     - Leggere l'array completo da `LOCAL_TASKS_KEY`, normalizzare sezioni e approvatori, eseguire `backfillMissingCodes`, poi separare:
       ```javascript
       tasks = localList.filter(function(x) { return !x.deleted; });
       deletedTasks = localList.filter(function(x) { return Boolean(x.deleted); });
       ```
4. **In `saveSingleTask(taskObj, nextTasksForLocal)` e `deleteSingleTaskFile(taskId, nextTasksForLocal)`:**
   - In modalità `fs`: `saveSingleTask` e `deleteSingleTaskFile` mantengono già sincronizzata `taskFileCache` tramite `taskFileCache.set(fname, ...)` e `taskFileCache.delete(fname)`.
   - In modalità `local`: salvare in `LOCAL_TASKS_KEY` la combinazione `tasks.concat(deletedTasks)` (non solo `tasks`), altrimenti il Cestino verrebbe perso al ricaricamento in modalità test locale.
5. **In `generateSafeAutoCode(sec, yearStr)`:**
   - Nella scansione da disco (`storageMode === 'fs'`), tutti i file `.json` della cartella `tasks` vengono già letti, garantendo che i codici del cestino non siano riutilizzati.
   - Nel fallback in memoria (`storageMode !== 'fs'`), passare `tasks.concat(deletedTasks)` a `computeNextCodeFromList(...)`.
6. **Nuove funzioni di gestione Cestino (in `assets/storage.js`):**
   - `async function softDeleteTaskById(id)`:
     - Trova `t` in `tasks`. Verifica `canEditTask(t)`.
     - Imposta:
       ```javascript
       t.deleted = true;
       t.deletedBy = currentUser.name + ' (' + currentUser.sec + ')';
       t.deletedAt = new Date().toISOString();
       ```
     - Con guardia `isSavingTask = true` (`try / finally`):
       - Rimuove `t` da `tasks` e lo inserisce in `deletedTasks`.
       - Chiama `await saveSingleTask(t, tasks.concat(deletedTasks));`.
       - Registra con `try/catch`: `await appendAuditLog('ELIMINATO', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Spostata nel Cestino');`.
   - `async function restoreTaskFromTrash(id)` (solo Amministratore):
     - Verifica permessi: `currentUser && currentUser.role === 'admin'`.
     - Trova `t` in `deletedTasks`.
     - Rimuove i metadati di cancellazione:
       ```javascript
       delete t.deleted;
       delete t.deletedBy;
       delete t.deletedAt;
       t.updatedBy = currentUser.name + ' (ADMIN)';
       t.updatedAt = new Date().toISOString();
       ```
     - Con guardia `isSavingTask = true` (`try / finally`):
       - Rimuove `t` da `deletedTasks` e lo reinserisce in `tasks`.
       - Chiama `await saveSingleTask(t, tasks.concat(deletedTasks));`.
       - Registra con `try/catch`: `await appendAuditLog('ADMIN', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Pratica ripristinata dal Cestino');`.
   - `async function purgeTaskPermanently(id)` (solo Amministratore):
     - Verifica permessi: `currentUser && currentUser.role === 'admin'`.
     - Trova `t` in `deletedTasks`.
     - Con guardia `isSavingTask = true` (`try / finally`):
       - Rimuove `t` da `deletedTasks`.
       - Chiama `await deleteSingleTaskFile(id, tasks.concat(deletedTasks));`.
       - Registra con `try/catch`: `await appendAuditLog('ADMIN', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Pratica eliminata definitivamente dal Cestino');`.
   - `async function purgeExpiredTrash(days)` (solo Amministratore):
     - Calcola la data limite: `now - (days * 86400000)`.
     - Filtra in `deletedTasks` tutte le pratiche con `deletedAt` antecedente alla data limite.
     - Se presenti, elimina definitivamente ciascun elemento chiamando `deleteSingleTaskFile` e registra audit log cumulativo.

### 2. Modifiche a `TaskTracker.html` e `TaskTracker_AdminSetup.html`
All'interno di `#modal-admin .modal` (dopo la tabella utenti e il box di migrazione dati), inserire due sezioni chiare ed ergonomiche:

1. **Sezione Cestino Pratiche (`#admin-trash-section`):**
   ```html
   <div id="admin-trash-section" style="background:var(--surface-sub); border:1px solid var(--border); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:10px;">
     <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
       <div>
         <h4 style="font-size:0.92rem; margin:0; display:flex; align-items:center; gap:6px;">
           🗑️ Cestino Pratiche Eliminate (<span id="admin-trash-count">0</span>)
         </h4>
         <div style="font-size:0.75rem; color:var(--muted);">Le pratiche eliminate rimangono nel Cestino e possono essere ripristinate solo dall'Amministratore.</div>
       </div>
       <button type="button" id="btn-purge-old-trash" class="std-btn btn-danger" style="font-size:0.78rem; padding:5px 10px;">
         🧹 Svuota &gt; 30 giorni
       </button>
     </div>
     <div style="max-height:28vh; overflow-y:auto; border:1px solid var(--border); border-radius:6px; background:var(--surface);">
       <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
         <thead>
           <tr style="background:var(--surface-sub); border-bottom:1px solid var(--border); text-align:left;">
             <th style="padding:6px 8px;">Codice</th>
             <th style="padding:6px 8px;">Sez.</th>
             <th style="padding:6px 8px;">Oggetto</th>
             <th style="padding:6px 8px;">Eliminata da / Data</th>
             <th style="padding:6px 8px; text-align:right;">Azioni</th>
           </tr>
         </thead>
         <tbody id="admin-trash-tbody"></tbody>
       </table>
     </div>
   </div>
   ```

2. **Sezione Backup & Ripristino Completo JSON (`#admin-backup-section`):**
   ```html
   <div id="admin-backup-section" style="background:var(--surface-sub); border:1px solid var(--border); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:8px;">
     <h4 style="font-size:0.92rem; margin:0;">💾 Backup &amp; Ripristino Integrale Database (JSON)</h4>
     <div style="font-size:0.75rem; color:var(--muted);">
       Salva uno snapshot completo (pratiche attive, cestino, utenti e cronologia) oppure ripristina un backup precedente.
     </div>
     <div style="display:flex; gap:8px; flex-wrap:wrap;">
       <button type="button" id="btn-admin-backup-json" class="std-btn btn-primary" style="font-size:0.82rem;">
         💾 Scarica Backup Completo (.json)
       </button>
       <button type="button" id="btn-admin-restore-json" class="std-btn btn-admin" style="font-size:0.82rem;">
         ♻️ Ripristina da Backup (.json)
       </button>
       <input type="file" id="backup-json-file" accept=".json" class="hidden">
     </div>
   </div>
   ```

### 3. Modifiche a `assets/app.js`
1. **Aggiornare `deleteTaskById(id)`:**
   - Eseguire prima il controllo conflitti: `const proceed = await verifyNoExternalConflict(t.id, t.updatedAt, false); if (!proceed) return;`.
   - Modificare il prompt di conferma: `'Spostare nel Cestino la pratica ' + (t.code || '') + '? (L\'Amministratore potrà ripristinarla)'`.
   - Chiamare `await softDeleteTaskById(id);`.
   - Aggiornare: `populateYearLists(); closeModal(); render(); showToast('Pratica ' + (t.code || '') + ' spostata nel Cestino');`.
2. **In `openAdminModal()`:**
   - Includere la chiamata a `renderAdminTrash();`.
3. **Nuova funzione `renderAdminTrash()`:**
   - Aggiorna `#admin-trash-count` con `deletedTasks.length`.
   - Ordina `deletedTasks` per data di cancellazione decrescente (`deletedAt`).
   - Popola `#admin-trash-tbody`. Se vuoto, produce riga `Nessuna pratica presente nel Cestino.`.
   - Per ciascuna pratica, genera pulsanti `data-trash-action="restore"` (`♻️ Ripristina`) e `data-trash-action="purge"` (`✕ Elimina definitivamente`).
4. **Nuove funzioni di Backup Completo & Ripristino:**
   - `async function exportFullBackupJson()`:
     - Chiama `await syncAllFromStorage(true, false);`.
     - Costruisce lo snapshot:
       ```javascript
       const snapshot = {
         app: 'OI_TASK_TRACKER',
         version: 1,
         exportedAt: new Date().toISOString(),
         exportedBy: currentUser ? currentUser.name : 'Admin',
         tasks: tasks.concat(deletedTasks),
         users: users,
         logs: logs
       };
       ```
     - Scarica `backup_OI_YYYY-MM-DD_HHmm.json` tramite `Blob` (`application/json`).
     - Registra audit log `'ADMIN'`, `'ADMIN'`, `'Backup Completo'`, `'Esportato snapshot JSON'`.
   - `async function handleRestoreBackupJson(e)`:
     - Legge e valida `JSON.parse`.
     - Verifica header obbligatorio: `data && data.app === 'OI_TASK_TRACKER' && Array.isArray(data.tasks)`.
     - Mostra `confirm()` con conteggio di pratiche, utenti e log.
     - Con guardia `isSavingTask = true` (`try / finally`):
       - Se presenti utenti, aggiorna `users` e `await saveUsersToStorage()`.
       - Ripristina ciascuna pratica salvando con `saveSingleTask` e aggiornando `taskFileCache`.
       - Ripristina i log in `logsDirHandle` o `LOCAL_LOGS_KEY`.
       - Registra audit log di ripristino.
     - Chiama `await syncAllFromStorage(true, true); renderAdminUsers(); renderAdminTrash(); render(); showToast('Backup ripristinato con successo');`.
5. **Event Listeners in `initApp()`:**
   - Listener delegato su `#admin-trash-tbody` per azioni `restore` e `purge`.
   - Listener su `#btn-purge-old-trash` (chiede conferma esplicita con conteggio prima di invocare `purgeExpiredTrash(30)`).
   - Listener su `#btn-admin-backup-json` e `#btn-admin-restore-json`.

---

## PARTE B — Filtri Rapidi 1-clic (Mia Sez., Attesa PCN, Verifica -7gg)

### 1. Modifiche a `TaskTracker.html` e `TaskTracker_AdminSetup.html`
All'interno di `#topbar-filters` (subito a sinistra del filtro tipologia `#f-tipo`), inserire i 3 pulsanti pillola:
```html
<button type="button" id="btn-qf-mysec" class="pill-ctrl hidden" title="Filtra solo la tua sezione">👤 Mia Sez.</button>
<button type="button" id="btn-qf-pcn" class="pill-ctrl" title="Pratiche consegnate a Prot./PCN ma non ancora rientrate">📤 Attesa PCN (<span id="qf-pcn-cnt">0</span>)</button>
<button type="button" id="btn-qf-mid" class="pill-ctrl" title="Pratiche in finestra di verifica intermedia (-7gg)">🔍 Verif. -7gg (<span id="qf-mid-cnt">0</span>)</button>
```

### 2. Modifiche a `assets/style.css`
Aggiungere le classi di evidenziazione visiva attiva per i pulsanti pillola (alto contrasto sia per tema chiaro che tema scuro):
```css
.pill-ctrl.toggle-on {
  background: var(--primary-light, #eff6ff) !important;
  border-color: var(--primary, #2563eb) !important;
  color: var(--primary, #1d4ed8) !important;
  font-weight: 600;
  box-shadow: 0 0 0 1px var(--primary, #2563eb) inset;
}
[data-theme="dark"] .pill-ctrl.toggle-on {
  background: rgba(59, 130, 246, 0.22) !important;
  border-color: #3b82f6 !important;
  color: #93c5fd !important;
  box-shadow: 0 0 0 1px #3b82f6 inset;
}
```

### 3. Modifiche a `assets/views.js`
1. **Nuove variabili di stato interfaccia:**
   ```javascript
   let quickFilterPcn = false;
   let quickFilterMid = false;
   ```
2. **In `getFilteredTasks()`:**
   - Inserire le condizioni di filtraggio rapido:
     ```javascript
     if (quickFilterPcn && !(t.pcnOut && !t.pcnIn)) return false;
     if (quickFilterMid && evaluateTask(t).code !== 'MID') return false;
     ```
3. **In `updateSidebarCounters()`:**
   - Calcolare i contatori all'interno dello scope attivo (anno e sezione selezionati):
     - `pcnCount`: pratiche attive (`!isClosedStatus(t.status)`) con `Boolean(t.pcnOut && !t.pcnIn)`.
     - `midCount`: pratiche attive con `evaluateTask(t).code === 'MID'`.
   - Aggiornare `#qf-pcn-cnt` e `#qf-mid-cnt`.
   - Aggiornare lo stato visuale:
     - `#btn-qf-pcn`: `.classList.toggle('toggle-on', quickFilterPcn)`.
     - `#btn-qf-mid`: `.classList.toggle('toggle-on', quickFilterMid)`.
     - `#btn-qf-mysec`: visibile solo per utenti di sezione (`currentUser && currentUser.role !== 'admin' && VALID_SECTIONS.includes(currentUser.sec)`); `.classList.toggle('toggle-on', activeSecFilter === currentUser.sec)`.

### 4. Modifiche a `assets/app.js`
In `initApp()`, collegare gli event listener:
- `#btn-qf-mysec`:
  - Se `activeSecFilter === currentUser.sec`, reimposta `setActiveSectionFilter('')`; altrimenti `setActiveSectionFilter(currentUser.sec)`.
  - Chiama `render()`.
- `#btn-qf-pcn`:
  - Alterna `quickFilterPcn = !quickFilterPcn;` e chiama `render()`.
- `#btn-qf-mid`:
  - Alterna `quickFilterMid = !quickFilterMid;` e chiama `render()`.

---

## PARTE C — Esportazione "Punto di Situazione" per Word / Outlook / Stampa

### 1. Modifiche a `TaskTracker.html` e `TaskTracker_AdminSetup.html`
1. **Pulsante 1 nella Barra Laterale Unificata (`.app-rail`, gruppo `Strumenti`):**
   ```html
   <button type="button" class="rail-item" id="btn-open-briefing" title="Punto di Situazione (Word / Outlook / Stampa)">
     <span class="rail-item-icon">📄</span>
     <span class="rail-item-label">Situazione</span>
   </button>
   ```
2. **Pulsante 2 nella Toolbar Statistiche (`.stats-toolbar`):**
   ```html
   <button type="button" id="btn-open-briefing-stats" class="std-btn btn-excel">📄 Riepilogo Riunione</button>
   ```
3. **Modale `#modal-briefing` (in fondo al documento, prima dei tag `<script>`):**
   ```html
   <div id="modal-briefing" class="modal-backdrop hidden">
     <div class="modal modal-wide" style="max-width:980px; width:95vw;">
       <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
         <h3 style="margin:0;">📄 Punto di Situazione — Pronto per Word / Outlook / Stampa</h3>
         <div style="display:flex; gap:8px; flex-wrap:wrap;">
           <button type="button" id="btn-copy-briefing" class="std-btn btn-primary">📋 Copia per Word / Outlook</button>
           <button type="button" id="btn-print-briefing" class="std-btn btn-excel">🖨️ Stampa / PDF</button>
           <button type="button" id="btn-close-briefing" class="std-btn" title="Chiudi (ESC)">Chiudi</button>
         </div>
       </div>
       <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; background:var(--surface-sub); padding:8px 12px; border-radius:8px; border:1px solid var(--border);">
         <select id="briefing-sec" class="pill-ctrl">
           <option value="">Tutte le Sezioni (Ufficio OI)</option>
           <option value="NATO">Solo Sezione NATO</option>
           <option value="UE">Solo Sezione UE</option>
           <option value="ONU">Solo Sezione ONU</option>
           <option value="FOI">Solo Sezione FOI</option>
         </select>
         <label style="font-size:0.81rem; display:flex; align-items:center; gap:6px; cursor:pointer;">
           <input type="checkbox" id="briefing-inc-done" checked> Includi concluse negli ultimi 7 giorni
         </label>
       </div>
       <div id="briefing-preview" class="briefing-sheet"></div>
     </div>
   </div>
   ```

### 2. Modifiche a `assets/style.css`
1. **Stile del Foglio Anteprima (`.briefing-sheet`):**
   ```css
   .briefing-sheet {
     background: #ffffff !important;
     color: #0f172a !important;
     padding: 24px;
     border-radius: 8px;
     border: 1px solid var(--border);
     max-height: 68vh;
     overflow-y: auto;
     box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
   }
   ```
2. **Regole `@media print` per Stampa Isolata del Foglio A4:**
   ```css
   @media print {
     body.printing-briefing .app-rail,
     body.printing-briefing .topbar,
     body.printing-briefing #app-main,
     body.printing-briefing .crit-filter-banner,
     body.printing-briefing .modal-backdrop:not(#modal-briefing),
     body.printing-briefing #modal-briefing > .modal > div:not(#briefing-preview) {
       display: none !important;
     }
     body.printing-briefing,
     body.printing-briefing #modal-briefing,
     body.printing-briefing #modal-briefing .modal,
     body.printing-briefing #briefing-preview {
       position: static !important;
       display: block !important;
       width: 100% !important;
       max-width: 100% !important;
       max-height: none !important;
       overflow: visible !important;
       background: #ffffff !important;
       color: #000000 !important;
       box-shadow: none !important;
       border: none !important;
       padding: 0 !important;
       margin: 0 !important;
     }
   }
   ```

### 3. Modifiche a `assets/views.js`
Aggiungere la funzione `buildBriefingHtml(secFilter, includeDone7d)`:
- Filtra `tasks` attivi per `secFilter` (se valorizzato).
- Suddivide le pratiche in **4 raggruppamenti ordinati per scadenza (`compareByDue`)**:
  1. **🔴 Scadute e Critiche (≤ 48h):** `['EXP', '24H', '48H'].includes(evaluateTask(t).code)`
  2. **🟣 In Verifica Intermedia (-7gg):** `evaluateTask(t).code === 'MID'`
  3. **🔵 Attive / In Lavorazione:** tutte le altre pratiche non chiuse. Se `t.pcnOut && !t.pcnIn`, aggiungere l'evidenza `[In PCN dal GG/MM]` nella colonna Stato.
  4. **🟢 Concluse negli ultimi 7 giorni** (se `includeDone7d` è attivo): pratiche con status che inizia per `completat` e aggiornate negli ultimi 7 giorni.
- **Formattazione Inline per Microsoft Word ed Outlook:** Generare le tabelle HTML con stili inline completi (`border-collapse:collapse; font-family:Calibri,Segoe UI,Arial,sans-serif; font-size:10pt;`, bordi `1px solid #cbd5e1`, intestazioni `#0f1b38` con testo `#ffffff`).
- Tutte le variabili dinamiche (`code`, `sec`, `title`, `dest`, `date`, `status`) devono essere sanificate con `escapeHtml()`.

### 4. Modifiche a `assets/app.js`
1. `function openBriefingModal()`:
   - Sincronizza `#briefing-sec` con `activeSecFilter || ''`.
   - Esegue `renderBriefingPreview()` e rimuove `.hidden` da `#modal-briefing`.
2. `function renderBriefingPreview()`:
   - Legge i controlli `#briefing-sec` e `#briefing-inc-done` e popola `#briefing-preview` con `buildBriefingHtml(...)`.
3. `async function copyBriefingToClipboard()`:
   - Copia l'HTML formattato per preservare tabelle e colori:
     - **Canale primario (`ClipboardItem`):**
       ```javascript
       const htmlBlob = new Blob([el.innerHTML], { type: 'text/html' });
       const textBlob = new Blob([el.innerText], { type: 'text/plain' });
       await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
       ```
     - **Fallback obbligatorio nel `catch` (per HTTP/LAN non-HTTPS o file://):**
       ```javascript
       const range = document.createRange();
       range.selectNodeContents(el);
       const sel = window.getSelection();
       sel.removeAllRanges();
       sel.addRange(range);
       document.execCommand('copy');
       sel.removeAllRanges();
       ```
   - Mostra toast: `showToast('Punto di Situazione copiato! Incolla in Word o Outlook (Ctrl+V)')`.
4. `function printBriefing()`:
   - Aggiunge `document.body.classList.add('printing-briefing')`, invoca `window.print()`, e rimuove la classe su `onafterprint` o tramite timeout di fallback.
5. Collegare gli event listener in `initApp()`.

---

## Criteri di Verifica (Test Obbligatori prima del Rilascio)
1. **Validazione Sintassi JS:**
   Eseguire `node --check assets/storage.js assets/views.js assets/app.js` — zero errori.
2. **Test Soft Delete & Cestino:**
   - Creare una nuova pratica ed eliminarla: deve sparire da Kanban, Tabella, Calendario e Statistiche, rimanendo su disco con `deleted: true`.
   - Dalla Dashboard Admin, verificare la presenza nel Cestino, ripristinarla e confermare il riallineamento nel Kanban con lo stesso codice progressivo.
   - Testare il pulsante `🧹 Svuota > 30 giorni` e l'eliminazione definitiva singola.
3. **Test Backup & Ripristino Integrale JSON:**
   - Scaricare il backup completo ed esaminare il JSON (`app: 'OI_TASK_TRACKER'`, array `tasks`, `users`, `logs`).
   - Simulare la perdita di dati e ripristinare il file: verificare l'avviso di conferma, il ripristino di tutti i file e la corretta persistenza di `taskFileCache`.
4. **Test Filtri Rapidi 1-clic:**
   - Verificare che `📤 Attesa PCN` isoli le pratiche consegnate ma non rientrate e aggiorni il contatore live.
   - Verificare che `🔍 Verif. -7gg` filtri le pratiche in verifica intermedia e che `👤 Mia Sez.` sia visibile solo agli operatori di sezione.
5. **Test Punto di Situazione:**
   - Aprire la modale sia dalla barra laterale (`.app-rail`) sia dalla toolbar Statistiche (`.stats-toolbar`).
   - Copiare negli appunti e incollare in Word o Outlook verificando l'integrità visiva delle tabelle.
   - Lanciare la stampa e verificare nel preview PDF l'assoluta pulizia del foglio A4 (nessun rail o topbar visibile).
