# PR: Pacchetto 1 — Punto di Situazione (Word/Outlook), Filtri Rapidi 1-clic, Cestino (Soft Delete) & Backup Completo

## Contesto e Vincoli Rigidi (LEGGERE PRIMA DI INIZIARE)
- Applicazione web 100% offline/LAN in vanilla JS senza bundler, senza librerie esterne e senza `type="module"`.
- Ordine di caricamento script invariato: `assets/storage.js` → `assets/views.js` → `assets/app.js`.
- **Sincronizzazione HTML:** Se nella cartella del progetto esiste sia `TaskTracker.html` sia `TaskTracker_AdminSetup.html`, applicare le **identiche modifiche HTML** a entrambi i file.
- **Sicurezza SMB (`isSavingTask`):** Ogni operazione di scrittura o modifica file su disco (`saveSingleTask`, `deleteSingleTaskFile`, `saveUsersToStorage`, ripristino backup) deve essere avvolta in:
  ```javascript
  isSavingTask = true;
  try {
    // scrittura file + log
  } finally {
    isSavingTask = false;
  }
  ```
- Non rimuovere né rompere alcuna funzionalità esistente (codifica automatica `N26-001`, `showToast()`, `IndexedDB` quick-reconnect, Drag & Drop Kanban/Calendario, controllo duplicati, statistiche).

---

## PARTE A — Cestino (Soft Delete) e Backup Completo JSON (Admin)

### Scelta Architetturale Obbligatoria
Non spostare i file in una sottocartella `trash/` (in `FileSystemAccessAPI` su share SMB non esiste un `move()` affidabile). Usare invece il **Soft Delete nel JSON**:
- Una pratica eliminata mantiene il suo file `tasks/<id>.json`, ma riceve i campi:
  ```json
  "deleted": true,
  "deletedBy": "Nome (Sezione)",
  "deletedAt": "2026-11-22T10:30:00.000Z"
  ```
- In memoria (`assets/storage.js`), separare nettamente i due array:
  - `tasks`: contiene **solo** le pratiche attive (`!obj.deleted`). In questo modo tutto il codice esistente di `views.js` e `app.js` continua a ignorare automaticamente le pratiche eliminate senza modifiche sparse.
  - `deletedTasks`: nuovo array globale che contiene **solo** le pratiche con `obj.deleted === true`.

### 1. Modifiche a `assets/storage.js`
1. **Dichiarazione stato globale (vicino a `let tasks = [], users = [], logs = [];`):**
   - Aggiungere: `let deletedTasks = [];`
2. **In `syncAllFromStorage(includeLogs)`:**
   - **Modalità `fs`:** durante la lettura dei file `.json` in `tasksDirHandle`:
     - Separare in `loadedActive` (`!obj.deleted`) e `loadedDeleted` (`Boolean(obj.deleted)`).
     - Eseguire `backfillMissingCodes(loadedActive.concat(loadedDeleted))`.
     - Assegnare `tasks = loadedActive;` e `deletedTasks = loadedDeleted;`.
   - **Modalità `local`:**
     - Leggere l'array da `LOCAL_TASKS_KEY`, normalizzare `dest`, eseguire `backfillMissingCodes`, poi separare:
       ```javascript
       tasks = allLocal.filter(function(x) { return !x.deleted; });
       deletedTasks = allLocal.filter(function(x) { return Boolean(x.deleted); });
       ```
3. **In `saveSingleTask(taskObj)` e `deleteSingleTaskFile(taskId)` (modalità `local`):**
   - Quando `storageMode !== 'fs'`, salvare in `LOCAL_TASKS_KEY` l'unione `tasks.concat(deletedTasks)` (non solo `tasks`), altrimenti il cestino si svuota al reload in modalità test locale.
4. **In `generateSafeAutoCode(sec, yearStr)`:**
   - Nessuna modifica richiesta alla lettura di `tasksDirHandle` (legge già tutti i `.json`, quindi i codici delle pratiche nel cestino non vengono mai riutilizzati). Nel fallback in memoria (`storageMode !== 'fs'`), passare `tasks.concat(deletedTasks)` a `computeNextCodeFromList(...)`.
5. **Nuove funzioni di gestione Cestino (in fondo a `assets/storage.js`):**
   - `async function softDeleteTaskById(id)`:
     - Trova `t` in `tasks`. Verifica `canEditTask(t)`.
     - Imposta `t.deleted = true; t.deletedBy = currentUser.name + ' (' + currentUser.sec + ')'; t.deletedAt = new Date().toISOString();`.
     - Con guardia `isSavingTask = true` (`try / finally`):
       - Rimuove `t` da `tasks` e lo aggiunge a `deletedTasks`.
       - Chiama `await saveSingleTask(t)`.
       - Con `try/catch` chiama `await appendAuditLog('ELIMINATO', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Spostata nel Cestino')`.
   - `async function restoreTaskFromTrash(id)` (solo Admin):
     - Verifica `currentUser && currentUser.role === 'admin'`.
     - Trova `t` in `deletedTasks`.
     - Rimuove `delete t.deleted; delete t.deletedBy; delete t.deletedAt;` e aggiorna `t.updatedBy` / `t.updatedAt`.
     - Con guardia `isSavingTask = true` (`try / finally`):
       - Rimuove `t` da `deletedTasks`, lo aggiunge a `tasks`, chiama `await saveSingleTask(t)`.
       - Con `try/catch` chiama `await appendAuditLog('ADMIN', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Pratica ripristinata dal Cestino')`.
   - `async function purgeTaskPermanently(id)` (solo Admin):
     - Verifica `currentUser && currentUser.role === 'admin'`.
     - Trova `t` in `deletedTasks`.
     - Con guardia `isSavingTask = true` (`try / finally`):
       - Rimuove `t` da `deletedTasks`, chiama `await deleteSingleTaskFile(id)`.
       - Con `try/catch` chiama `await appendAuditLog('ADMIN', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Pratica eliminata definitivamente dal Cestino')`.
   - `async function purgeExpiredTrash(days)` (opzionale helper o pulsante "Svuota > 30 gg"):
     - Elimina definitivamente gli elementi di `deletedTasks` con `deletedAt` più vecchio di `days` giorni.

### 2. Modifiche a `TaskTracker.html` (e `TaskTracker_AdminSetup.html` se presente)
Dentro `#modal-admin .modal` (sotto la tabella utenti e vicino al box Migrazione Excel), aggiungere **due sezioni pulite**:

1. **Sezione Cestino Pratiche (`#admin-trash-section`):**
   - Intestazione: `🗑️ Cestino Pratiche Eliminate (<span id="admin-trash-count">0</span>)` + pulsante `#btn-purge-old-trash` (`Svuota > 30 giorni`).
   - Tabella compatta (`max-height: 28vh; overflow-y: auto;`) con colonne: `Codice`, `Sez.`, `Oggetto`, `Eliminata da / Data`, `Azioni` (`<tbody id="admin-trash-tbody"></tbody>`).
2. **Sezione Backup & Ripristino Completo (`#admin-backup-section`):**
   - Pulsante `#btn-admin-backup-json` (`class="std-btn btn-primary"`): `💾 Scarica Backup Completo (.json)`.
   - Pulsante `#btn-admin-restore-json` (`class="std-btn btn-admin"`): `♻️ Ripristina da Backup (.json)` + `<input type="file" id="backup-json-file" accept=".json" class="hidden">`.

### 3. Modifiche a `assets/app.js`
1. **Aggiornare `deleteTaskById(id)`:**
   - Cambiare il messaggio di conferma in: `'Spostare nel Cestino la pratica ' + (t.code || '') + '? (L\'Amministratore potrà ripristinarla)'`.
   - Chiamare `await softDeleteTaskById(id);` invece della rimozione irreversibile.
   - Chiamare `populateYearLists(); closeModal(); render(); showToast('Pratica ' + (t.code || '') + ' spostata nel Cestino');`.
2. **In `openAdminModal()`:**
   - Chiamare `renderAdminUsers();` e la nuova funzione `renderAdminTrash();`.
3. **Nuova funzione `renderAdminTrash()`:**
   - Aggiorna `#admin-trash-count` con `deletedTasks.length`.
   - Ordina `deletedTasks` per `deletedAt` decrescente.
   - Popola `#admin-trash-tbody` con pulsanti `data-trash-action="restore"` (`♻️ Ripristina`) e `data-trash-action="purge"` (`✕ Elimina definitivamente`). Se vuoto, mostra una riga `Nessuna pratica nel Cestino.`
4. **Nuove funzioni Backup & Ripristino JSON (solo Admin):**
   - `async function exportFullBackupJson()`:
     - Chiama `await syncAllFromStorage(true);` per avere lo stato più recente di tasks, users e logs.
     - Costruisce oggetto:
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
     - Scarica file `backup_OI_YYYY-MM-DD_HHmm.json` usando `Blob` con `type: 'application/json'`.
     - Registra log `'ADMIN'`, `'Backup Completo'`, `'Esportato snapshot JSON (' + snapshot.tasks.length + ' pratiche)'`.
   - `async function handleRestoreBackupJson(e)`:
     - Legge il file `.json` selezionato e fa `JSON.parse`.
     - Valida che `data && data.app === 'OI_TASK_TRACKER' && Array.isArray(data.tasks)`. Se non valido, `alert('File di backup non valido.')` e termina.
     - Chiede conferma esplicita: `confirm('Ripristinare ' + data.tasks.length + ' pratiche, ' + (data.users ? data.users.length : 0) + ' utenti e ' + (data.logs ? data.logs.length : 0) + ' log dal backup del ' + formatTimestamp(data.exportedAt) + '?\n\nI file con lo stesso ID verranno sovrascritti.')`.
     - Con guardia `isSavingTask = true` (`try / finally`):
       - Se `Array.isArray(data.users) && data.users.length > 0`, assegna `users = data.users` e chiama `await saveUsersToStorage()`.
       - Per ogni `t` in `data.tasks`: aggiorna/inserisce in `tasks` o `deletedTasks` (in base a `t.deleted`) e chiama `await saveSingleTask(t)`.
       - Se `storageMode === 'fs'` e `Array.isArray(data.logs)`: scrive ogni log `l` in `logsDirHandle` (`writeJsonFile(logsDirHandle, l.id + '.json', l)`). In modalità `local`, unisce/salva `logs` in `LOCAL_LOGS_KEY`.
     - Chiama `await appendAuditLog('ADMIN', 'ADMIN', 'Ripristino Backup', 'Ripristinato backup JSON del ' + formatTimestamp(data.exportedAt))`.
     - Chiama `await syncAllFromStorage(true); renderAdminUsers(); renderAdminTrash(); render();`.
     - Mostra `alert('Ripristino completato con successo.');` e azzera `e.target.value = ''`.
5. **Event listeners in `initApp()`:**
   - Listener delegato su `#admin-trash-tbody` per `restore` e `purge` (con `confirm()` prima del `purge`).
   - Listener su `#btn-purge-old-trash` (con `confirm()` prima di eliminare elementi > 30 giorni).
   - Listener su `#btn-admin-backup-json` → `exportFullBackupJson`.
   - Listener su `#btn-admin-restore-json` → click su `#backup-json-file`; `change` su `#backup-json-file` → `handleRestoreBackupJson`.

---

## PARTE B — Filtri Rapidi 1-clic (Attesa PCN, Mia Sezione, Verifica -7gg)

### 1. Modifiche a `TaskTracker.html` (e `TaskTracker_AdminSetup.html` se presente)
Nel contenitore `#topbar-filters` (subito prima di `#f-tipo` oppure in una riga compatta dedicata `#quick-filters-bar` appena sotto `.topbar` — preferire `#topbar-filters` per non ridurre l'altezza verticale del Kanban):
- Aggiungere 3 pulsanti pillola compatti con classe `pill-ctrl`:
  ```html
  <button type="button" id="btn-qf-mysec" class="pill-ctrl hidden" title="Filtra solo la tua sezione">👤 Mia Sez.</button>
  <button type="button" id="btn-qf-pcn" class="pill-ctrl" title="Pratiche consegnate a Prot./PCN ma non ancora rientrate">📤 Attesa PCN (<span id="qf-pcn-cnt">0</span>)</button>
  <button type="button" id="btn-qf-mid" class="pill-ctrl" title="Pratiche in finestra di verifica intermedia (-7gg)">🔍 Verif. -7gg (<span id="qf-mid-cnt">0</span>)</button>
  ```

### 2. Modifiche a `assets/views.js`
1. **Nuove variabili di stato (vicino a `let onlyCriticalFilter = false;`):**
   ```javascript
   let quickFilterPcn = false;
   let quickFilterMid = false;
   ```
2. **In `getFilteredTasks()`:**
   - Aggiungere le due condizioni subito dopo `if (onlyCriticalFilter) { ... }`:
     ```javascript
     if (quickFilterPcn && !(t.pcnOut && !t.pcnIn)) return false;
     if (quickFilterMid && evaluateTask(t).code !== 'MID') return false;
     ```
3. **In `updateSidebarCounters()`:**
   - Calcolare i contatori live su `tasks` (escludendo i chiusi se `hideCompleted` è attivo, oppure su tutte le pratiche attive non chiuse):
     - `pcnCount`: pratiche non chiuse (`!isClosedStatus(t.status)`) con `Boolean(t.pcnOut && !t.pcnIn)`.
     - `midCount`: pratiche con `evaluateTask(t).code === 'MID'`.
   - Aggiornare `#qf-pcn-cnt` e `#qf-mid-cnt`.
   - Aggiornare classe attiva `.toggle-on` sui 3 pulsanti:
     - `#btn-qf-pcn`: `.classList.toggle('toggle-on', quickFilterPcn)`
     - `#btn-qf-mid`: `.classList.toggle('toggle-on', quickFilterMid)`
     - `#btn-qf-mysec`: visibile solo se `currentUser && currentUser.role !== 'admin' && ['NATO','UE','ONU','FOI'].includes(currentUser.sec)`; `.classList.toggle('toggle-on', activeSecFilter === currentUser.sec)`.

### 3. Modifiche a `assets/app.js`
In `initApp()`, aggiungere gli event listener:
- `#btn-qf-mysec`:
  - Alterna `activeSecFilter = (activeSecFilter === currentUser.sec) ? '' : currentUser.sec;`.
  - Sincronizza la classe `.active` su `#sb-sec-list .sb-item` in base ad `activeSecFilter`.
  - Chiama `render()`.
- `#btn-qf-pcn`:
  - Alterna `quickFilterPcn = !quickFilterPcn;` e chiama `render()`.
- `#btn-qf-mid`:
  - Alterna `quickFilterMid = !quickFilterMid;` e chiama `render()`.

---

## PARTE C — Esportazione "Punto di Situazione" per Word / Outlook / Stampa

### 1. Modifiche a `TaskTracker.html` (e `TaskTracker_AdminSetup.html` se presente)
1. **Pulsanti di apertura:**
   - Nella `.sb-footer` della sidebar (sopra `btn-export-csv`):
     ```html
     <button type="button" id="btn-open-briefing" class="sb-btn">📄 Punto di Situazione</button>
     ```
   - Nella `.stats-toolbar` (accanto a `btn-print-stats`):
     ```html
     <button type="button" id="btn-open-briefing-stats" class="std-btn btn-excel">📄 Riepilogo Riunione</button>
     ```
2. **Nuova modale `#modal-briefing` (in fondo al body, dopo le altre modali):**
   ```html
   <div id="modal-briefing" class="modal-backdrop hidden">
     <div class="modal modal-wide">
       <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
         <h3>📄 Punto di Situazione — Pronto per Word / Outlook / Stampa</h3>
         <div style="display:flex; gap:8px; flex-wrap:wrap;">
           <button type="button" id="btn-copy-briefing" class="std-btn btn-primary">📋 Copia per Word / Outlook</button>
           <button type="button" id="btn-print-briefing" class="std-btn btn-excel">🖨️ Stampa / PDF</button>
           <button type="button" id="btn-close-briefing" class="std-btn">Chiudi</button>
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
1. Stile del foglio di anteprima `#briefing-preview.briefing-sheet`:
   - Sfondo bianco `#ffffff`, testo scuro `#111827`, padding `20px`, border-radius `8px`, `border: 1px solid var(--border)`, `max-height: 68vh; overflow-y: auto;` (sempre chiaro/leggibile stile foglio A4 anche quando l'app è in tema scuro).
2. Regola `@media print` dedicata alla stampa del solo Punto di Situazione:
   - Quando `body` ha classe `printing-briefing`:
     - Nascondere `.sidebar`, `.tool-rail`, `.workspace`, e tutte le modali tranne `#modal-briefing`.
     - Rimuovere `position: fixed`, backdrop scuro, ombre e `max-height` da `#modal-briefing`, `.modal` e `#briefing-preview`, nascondendo i pulsanti e la barra opzioni dentro `#modal-briefing`, in modo che venga stampato **solo il contenuto pulito di `#briefing-preview`**.

### 3. Modifiche a `assets/views.js`
Aggiungere `function buildBriefingHtml(secFilter, includeDone7d)`:
- Filtra `tasks` per `secFilter` (se valorizzato).
- Suddivide le pratiche in **4 gruppi ordinati per scadenza (`compareByDue`)**:
  1. **🔴 Scadute e Critiche (≤ 48h):** `['EXP', '24H', '48H'].includes(evaluateTask(t).code)`
  2. **🟣 In Verifica Intermedia (-7gg):** `evaluateTask(t).code === 'MID'`
  3. **🔵 Attive / In Lavorazione:** tutte le altre pratiche non chiuse (`!isClosedStatus(t.status)` e non già nei gruppi 1 o 2). Se `t.pcnOut && !t.pcnIn`, aggiungere tag testuale `[In PCN dal GG/MM]` nella colonna Stato.
  4. **🟢 Concluse negli ultimi 7 giorni** (solo se `includeDone7d === true`): pratiche con `status` che inizia per `completat` e `updatedAt` (o `insDate`) negli ultimi 7 giorni (`(Date.now() - new Date(ref).getTime()) <= 7 * 86400000`).
- **Importante per compatibilità Word / Outlook:** generare le tabelle HTML con **stili CSS inline** (`style="width:100%; border-collapse:collapse; font-family:Calibri,Segoe UI,Arial,sans-serif; font-size:10pt;"`, bordi `1px solid #cbd5e1`, celle con `padding:5px 7px;`, header tabella con sfondo `#0f1b38` e testo `#ffffff`).
- Colonne di ogni tabella: `Codice` | `Sez.` | `Oggetto` | `Approv.` | `Scadenza` | `Stato / Note PCN`.
- In cima al documento inserire titolo **UFFICIO OI — PUNTO DI SITUAZIONE**, data/ora generazione, ambito (Ufficio OI o Sezione) e riga riepilogativa con i conteggi dei 4 gruppi.

### 4. Modifiche a `assets/app.js`
1. `function openBriefingModal()`:
   - Pre-imposta `#briefing-sec` su `activeSecFilter || ''`.
   - Chiama `renderBriefingPreview()` e rimuove `.hidden` da `#modal-briefing`.
2. `function renderBriefingPreview()`:
   - Legge `#briefing-sec` e `#briefing-inc-done`, scrive il risultato di `buildBriefingHtml(...)` dentro `#briefing-preview`.
3. `async function copyBriefingToClipboard()`:
   - Copia l'HTML formattato di `#briefing-preview` negli appunti in modo che incollandolo in **Word** o **Outlook** mantenga tabelle, colori e grassetti:
     - **Tentativo 1 (moderno, se `navigator.clipboard && window.ClipboardItem`):**
       ```javascript
       const htmlBlob = new Blob([el.innerHTML], { type: 'text/html' });
       const textBlob = new Blob([el.innerText], { type: 'text/plain' });
       await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
       ```
     - **Fallback obbligatorio nel `catch` (per `file://` o HTTP LAN non-HTTPS):**
       Usa `document.createRange()`, `range.selectNodeContents(el)`, `window.getSelection()` e `document.execCommand('copy')`, poi `sel.removeAllRanges()`.
   - Mostra `showToast('Punto di Situazione copiato! Incolla in Word o Outlook (Ctrl+V)')`.
4. `function printBriefing()`:
   - Aggiunge `document.body.classList.add('printing-briefing')`, chiama `window.print()`, e su `onafterprint` (con fallback `setTimeout(..., 500)`) rimuove `printing-briefing`.
5. Collegare tutti i listener in `initApp()`.

---

## Criteri di Verifica (Test Obbligatori prima di chiudere)
1. **Sintassi:** eseguire `node --check assets/storage.js assets/views.js assets/app.js` — zero errori.
2. **Soft Delete & Cestino:**
   - Creare 1 pratica, eliminarla → sparisce da Kanban/Tabella/Calendario, ma il file `.json` esiste ancora con `"deleted": true`.
   - Accedere come Admin → aprire Dashboard Admin → verificare che la pratica compaia nel Cestino (`#admin-trash-tbody`).
   - Cliccare `♻️ Ripristina` → la pratica torna visibile nel Kanban con lo stesso codice.
   - Eliminarla di nuovo e cliccare `✕ Elimina definitivamente` → il file `.json` viene rimosso definitivamente.
3. **Backup & Ripristino JSON:**
   - Cliccare `💾 Scarica Backup Completo (.json)` → verificare che il file generato contenga `app: "OI_TASK_TRACKER"` e gli array `tasks`, `users`, `logs`.
   - Simulare perdita di un task e ripristinare lo stesso file JSON → verificare che il task ricompaia e che `isSavingTask` torni a `false` nel `finally`.
4. **Filtri Rapidi 1-clic:**
   - Creare 1 pratica con `pcnOut` compilato e `pcnIn` vuoto → `#qf-pcn-cnt` si incrementa; cliccando `📤 Attesa PCN` viene mostrata solo quella pratica.
   - Verificare `👤 Mia Sez.` visibile per un utente di sezione (es. NATO) e nascosto per Admin.
   - Verificare `🔍 Verif. -7gg` con una pratica in stato `MID`.
5. **Punto di Situazione:**
   - Aprire `📄 Punto di Situazione` → verificare anteprima con i 4 blocchi corretti e cambio filtro Sezione / checkbox concluse 7gg.
   - Cliccare `📋 Copia per Word / Outlook` → verificare toast di conferma senza errori in Console.
   - Cliccare `🖨️ Stampa / PDF` → verificare che `printing-briefing` venga applicata e rimossa correttamente.
6. **Pulizia:** rimuovere eventuali server temporanei, log e dati di prova usati durante il test; zero errori JS in Console.