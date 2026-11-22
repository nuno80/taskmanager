/* =========================================================
   storage.js — Archivio condiviso (File System Access API),
   file atomici JSON, utenti/PIN, audit log e utility sui dati.
   ========================================================= */

const LOCAL_TASKS_KEY = 'OI_MULTI_TASKS_FALLBACK';
const LOCAL_USERS_KEY = 'OI_MULTI_USERS_FALLBACK';
const LOCAL_LOGS_KEY  = 'OI_MULTI_LOGS_FALLBACK';
const THEME_KEY       = 'OI_THEME_PREF_V4';
const SEC_PREFIX      = { NATO: 'N', UE: 'U', ONU: 'O', FOI: 'F' };
const SEC_COLORS      = { NATO: '#2563eb', UE: '#eab308', ONU: '#06b6d4', FOI: '#10b981' };
const DB_SIGNATURE_FILE = 'db-config.json';

function isAdminSetupMode() {
  return typeof window !== 'undefined' && window.APP_MODE === 'admin_setup';
}

// Stato archivio
let storageMode = 'none';
let rootDirHandle = null, tasksDirHandle = null, logsDirHandle = null;
let tasks = [], users = [], logs = [];
let currentUser = null;
let isSyncing = false;
let isSavingTask = false;
let syncIntervalId = null;

/* -------------------------------------------------------------------------
   CODICE AUTOMATICO (N26-001) & UTILITY DATI
   ------------------------------------------------------------------------- */
function normalizeApprover(val) {
  const s = String(val || '').trim();
  if (!s) return 'CR';
  if (s.toUpperCase() === 'CR III') return 'CR';
  return s;
}

function getTaskYear(t) {
  if (t.insDate && /^\d{4}/.test(t.insDate)) return t.insDate.slice(0, 4);
  if (t.date && /^\d{4}/.test(t.date)) return t.date.slice(0, 4);
  if (t.createdAt && /^\d{4}/.test(t.createdAt)) return t.createdAt.slice(0, 4);
  if (t.code && /^[NUOF](\d{2})-/.test(t.code)) return '20' + t.code.slice(1, 3);
  return String(new Date().getFullYear());
}

function computeNextCodeFromList(taskList, sec, yearStr) {
  const prefix = SEC_PREFIX[sec] || 'X';
  const yy = String(yearStr || new Date().getFullYear()).slice(-2);
  const regex = new RegExp('^' + prefix + yy + '-(\\d+)$');
  let maxNum = 0;
  taskList.forEach(function(t) {
    if (t.code) {
      const m = String(t.code).match(regex);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  });
  return prefix + yy + '-' + String(maxNum + 1).padStart(3, '0');
}

async function generateSafeAutoCode(sec, yearStr) {
  if (storageMode === 'fs' && tasksDirHandle) {
    const freshList = [];
    try {
      for await (const [name, handle] of tasksDirHandle.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json')) {
          try {
            const obj = JSON.parse(await (await handle.getFile()).text());
            if (obj && obj.code) freshList.push(obj);
          } catch (e) {}
        }
      }
      return computeNextCodeFromList(freshList, sec, yearStr);
    } catch (e) {}
  }
  return computeNextCodeFromList(tasks, sec, yearStr);
}

function backfillMissingCodes(taskList) {
  taskList.forEach(function(t) {
    if (!t.code) t.code = computeNextCodeFromList(taskList, t.sec || 'NATO', getTaskYear(t));
  });
}

function toISODateLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatTimestamp(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function formatD(isoDate) {
  if (!isoDate) return '-';
  const p = isoDate.split('-');
  return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : isoDate;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  });
}

function isClosedStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return s.startsWith('completat') || s.startsWith('annullat');
}

/* -------------------------------------------------------------------------
   STORAGE LAYER (FILE SYSTEM ACCESS API + FALLBACK LOCALE)
   ------------------------------------------------------------------------- */
async function readJsonFile(dirHandle, filename) {
  try { return JSON.parse(await (await (await dirHandle.getFileHandle(filename)).getFile()).text()); }
  catch (e) { return null; }
}

async function writeJsonFile(dirHandle, filename, data) {
  const fh = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function deleteFileFromDir(dirHandle, filename) {
  try { await dirHandle.removeEntry(filename); } catch (e) {}
}

/* -------------------------------------------------------------------------
   MEMORIA PERSISTENTE DEL DIRECTORY HANDLE (IndexedDB)
   Un DirectoryHandle non è serializzabile in localStorage: solo IndexedDB
   lo conserva, così dopo un refresh basta 1 clic invece di rinavigare.
   ------------------------------------------------------------------------- */
const HANDLE_DB_NAME = 'OI_TaskTracker_Handles';
const HANDLE_DB_STORE = 'handles';
const HANDLE_DB_KEY = 'rootDir';

function openHandleDB() {
  return new Promise(function(resolve, reject) {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = function() { req.result.createObjectStore(HANDLE_DB_STORE); };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function txDone(tx) {
  return new Promise(function(resolve, reject) {
    tx.oncomplete = function() { resolve(); };
    tx.onerror = function() { reject(tx.error); };
    tx.onabort = function() { reject(tx.error); };
  });
}

async function saveSavedDirHandle(handle) {
  const db = await openHandleDB();
  const tx = db.transaction(HANDLE_DB_STORE, 'readwrite');
  const done = txDone(tx);
  tx.objectStore(HANDLE_DB_STORE).put(handle, HANDLE_DB_KEY);
  await done;
}

async function getSavedDirHandle() {
  try {
    const db = await openHandleDB();
    return await new Promise(function(resolve) {
      const req = db.transaction(HANDLE_DB_STORE, 'readonly').objectStore(HANDLE_DB_STORE).get(HANDLE_DB_KEY);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { resolve(null); };
    });
  } catch (e) { return null; }
}

function resetFsHandles() {
  storageMode = 'none';
  rootDirHandle = tasksDirHandle = logsDirHandle = null;
}

// Apre un handle già selezionato: sottocartelle, utenti, primo avvio, sync.
async function enterFsMode(rootHandle) {
  if (!isAdminSetupMode()) {
    // Modalità utente: validazione preventiva e rigorosa, nessun file/cartella creato
    let valid = false;
    let tHandle = null;
    let lHandle = null;
    try {
      tHandle = await rootHandle.getDirectoryHandle('tasks', { create: false });
      lHandle = await rootHandle.getDirectoryHandle('logs', { create: false });
      const uFile = await rootHandle.getFileHandle('users.json', { create: false });
      if (tHandle && lHandle && uFile) {
        valid = true;
      }
    } catch (e) {
      valid = false;
    }

    if (valid) {
      try {
        const cfg = await readJsonFile(rootHandle, DB_SIGNATURE_FILE);
        if (cfg && cfg.app && cfg.app !== 'OI_TASK_TRACKER') {
          valid = false;
        }
      } catch (e) {
        valid = false;
      }
    }

    if (!valid) {
      resetFsHandles();
      const hint = (typeof window !== 'undefined' && window.EXPECTED_DB_HINT) ? (': ' + window.EXPECTED_DB_HINT) : '';
      throw new Error('Cartella non valida: non contiene un archivio Uff. OI inizializzato. Seleziona la cartella corretta' + hint);
    }

    rootDirHandle = rootHandle;
    tasksDirHandle = tHandle;
    logsDirHandle = lHandle;
    storageMode = 'fs';
    try { await saveSavedDirHandle(rootHandle); } catch (e) { console.warn('Handle non memorizzato:', e); }

    await loadUsersFromStorage();
    if (users.length === 0) {
      resetFsHandles();
      const hint = (typeof window !== 'undefined' && window.EXPECTED_DB_HINT) ? (': ' + window.EXPECTED_DB_HINT) : '';
      throw new Error('Cartella non valida: archivio privo di utenti registrati. Seleziona la cartella corretta' + hint);
    }
    await syncAllFromStorage(true);
    return false;
  }

  // Modalità setup admin
  rootDirHandle = rootHandle;
  tasksDirHandle = await rootHandle.getDirectoryHandle('tasks', { create: true });
  logsDirHandle  = await rootHandle.getDirectoryHandle('logs', { create: true });
  storageMode = 'fs';
  try { await saveSavedDirHandle(rootHandle); } catch (e) { console.warn('Handle non memorizzato:', e); }

  await loadUsersFromStorage();
  let isFirstRun = false;
  if (users.length === 0) {
    users = [{ id: 'USR-ADMIN', name: 'Admin', sec: 'TUTTE', role: 'admin', pin: '0000' }];
    await saveUsersToStorage();
    isFirstRun = true;
  }

  const existingConfig = await readJsonFile(rootHandle, DB_SIGNATURE_FILE);
  if (!existingConfig) {
    await writeJsonFile(rootHandle, DB_SIGNATURE_FILE, {
      app: 'OI_TASK_TRACKER',
      folderName: rootHandle.name,
      initializedAt: new Date().toISOString()
    });
  }

  await syncAllFromStorage(true);
  return isFirstRun;
}

async function reconnectSavedFolder() {
  const errBox = document.getElementById('folder-error');
  errBox.classList.add('hidden');
  const saved = await getSavedDirHandle();
  if (!saved) {
    errBox.textContent = 'Nessuna cartella memorizzata. Usa 📂 Connetti Cartella Condivisa in Rete.';
    errBox.classList.remove('hidden');
    return;
  }
  try {
    let perm = await saved.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await saved.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      errBox.textContent = 'Permesso negato dal browser. Clicca di nuovo oppure seleziona la cartella.';
      errBox.classList.remove('hidden');
      return;
    }
    const isFirstRun = await enterFsMode(saved);
    showLoginStep('📁 Archivio riconnesso: <b>' + escapeHtml(rootDirHandle.name) + '</b> (Multi-Utente Attivo)', isFirstRun);
  } catch (err) {
    resetFsHandles();
    errBox.textContent = err.message && err.message.startsWith('Cartella non valida')
      ? err.message
      : ('Cartella precedente non più raggiungibile (' + err.message + '). Selezionala di nuovo.');
    errBox.classList.remove('hidden');
  }
}

async function initSharedFolder() {
  const errBox = document.getElementById('folder-error');
  errBox.classList.add('hidden');
  if (typeof window.showDirectoryPicker !== 'function') {
    errBox.textContent = 'Browser non supportato per cartelle condivise. Usa Microsoft Edge o Chrome aggiornati.';
    errBox.classList.remove('hidden');
    return;
  }
  try {
    const isFirstRun = await enterFsMode(await window.showDirectoryPicker({ mode: 'readwrite' }));
    showLoginStep('📁 Archivio connesso: <b>' + escapeHtml(rootDirHandle.name) + '</b> (Multi-Utente Attivo)', isFirstRun);
  } catch (err) {
    if (err.name !== 'AbortError') {
      resetFsHandles();
      errBox.textContent = err.message && err.message.startsWith('Cartella non valida')
        ? err.message
        : ('Impossibile accedere alla cartella: ' + err.message);
      errBox.classList.remove('hidden');
    }
  }
}

async function initLocalFallback() {
  storageMode = 'local';
  await loadUsersFromStorage();
  let isFirstRun = false;
  if (users.length === 0) {
    users = [{ id: 'USR-ADMIN', name: 'Admin', sec: 'TUTTE', role: 'admin', pin: '0000' }];
    await saveUsersToStorage();
    isFirstRun = true;
  }
  await syncAllFromStorage(true);
  showLoginStep('💻 Modalità Locale (Solo questo browser — non condiviso in rete)', isFirstRun);
}

async function loadUsersFromStorage() {
  if (storageMode === 'fs') {
    const data = await readJsonFile(rootDirHandle, 'users.json');
    users = Array.isArray(data) ? data : [];
  } else {
    try { users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]'); } catch (e) { users = []; }
  }
}

async function saveUsersToStorage() {
  if (storageMode === 'fs') await writeJsonFile(rootDirHandle, 'users.json', users);
  else { try { localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users)); } catch (e) {} }
}

async function saveSingleTask(taskObj) {
  if (storageMode === 'fs') await writeJsonFile(tasksDirHandle, taskObj.id + '.json', taskObj);
  else { try { localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks)); } catch (e) {} }
}

async function deleteSingleTaskFile(taskId) {
  if (storageMode === 'fs') await deleteFileFromDir(tasksDirHandle, taskId + '.json');
  else { try { localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks)); } catch (e) {} }
}

async function appendAuditLog(action, sec, targetTitle, details) {
  const now = new Date();
  const entry = {
    id: 'LOG-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 6),
    ts: now.toISOString(),
    user: currentUser ? currentUser.name : 'Sistema',
    userSec: currentUser ? currentUser.sec : 'ADMIN',
    action: action,
    sec: sec || (currentUser ? currentUser.sec : 'ADMIN'),
    target: targetTitle || '-',
    details: details || ''
  };
  logs.unshift(entry);
  if (storageMode === 'fs') await writeJsonFile(logsDirHandle, entry.id + '.json', entry);
  else { try { localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(logs)); } catch (e) {} }
}

async function syncAllFromStorage(includeLogs) {
  if (isSyncing || isSavingTask) return;
  isSyncing = true;
  const statusDot = document.getElementById('sync-status');
  const miniDot = document.getElementById('sync-dot-indicator');
  const syncBtn = document.getElementById('btn-sync-now');
  try {
    if (storageMode === 'fs') {
      await loadUsersFromStorage();
      const loadedTasks = [];
      for await (const [name, handle] of tasksDirHandle.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json')) {
          try {
            const obj = JSON.parse(await (await handle.getFile()).text());
            if (obj && obj.id) { obj.dest = normalizeApprover(obj.dest); loadedTasks.push(obj); }
          } catch (e) {}
        }
      }
      backfillMissingCodes(loadedTasks);
      tasks = loadedTasks;
      if (includeLogs) {
        const loadedLogs = [];
        for await (const [name, handle] of logsDirHandle.entries()) {
          if (handle.kind === 'file' && name.endsWith('.json')) {
            try {
              const obj = JSON.parse(await (await handle.getFile()).text());
              if (obj && obj.ts) loadedLogs.push(obj);
            } catch (e) {}
          }
        }
        loadedLogs.sort(function(a, b) { return new Date(b.ts) - new Date(a.ts); });
        logs = loadedLogs;
      }
      if (statusDot) { statusDot.textContent = '✓ Rete: ' + rootDirHandle.name; statusDot.style.color = '#86efac'; }
      if (miniDot) miniDot.style.background = '#22c55e';
      if (syncBtn) syncBtn.title = 'Sincronizzato con rete: ' + rootDirHandle.name;
    } else {
      try { tasks = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]'); } catch (e) { tasks = []; }
      tasks.forEach(function(t) { t.dest = normalizeApprover(t.dest); });
      backfillMissingCodes(tasks);
      if (includeLogs) { try { logs = JSON.parse(localStorage.getItem(LOCAL_LOGS_KEY) || '[]'); } catch (e) { logs = []; } }
      if (statusDot) { statusDot.textContent = '💻 Locale (Test)'; statusDot.style.color = '#fde047'; }
      if (miniDot) miniDot.style.background = '#eab308';
      if (syncBtn) syncBtn.title = 'Modalità Locale (Test)';
    }

    const metaEl = document.getElementById('sync-meta');
    if (metaEl) metaEl.textContent = 'Agg. ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    populateYearLists();
    if (currentUser) render();
  } catch (err) {
    if (statusDot) { statusDot.textContent = '⚠ Errore Sync'; statusDot.style.color = '#fca5a5'; }
    if (miniDot) miniDot.style.background = '#ef4444';
    if (syncBtn) syncBtn.title = 'Errore Sincronizzazione';
  } finally {
    isSyncing = false;
  }
}

/* -------------------------------------------------------------------------
   LOGIN & PERMESSI
   ------------------------------------------------------------------------- */
function showLoginStep(infoHtml, isFirstRun) {
  document.getElementById('auth-step-folder').classList.add('hidden');
  document.getElementById('auth-step-login').classList.remove('hidden');
  document.getElementById('connected-folder-info').innerHTML = infoHtml;
  document.getElementById('first-run-hint').classList.toggle('hidden', !isFirstRun);

  const sel = document.getElementById('login-user-select');
  sel.innerHTML = users.map(function(u) {
    const label = u.role === 'admin' ? (u.name + ' [AMMINISTRATORE]') : (u.name + ' — Sezione ' + u.sec);
    return '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(label) + '</option>';
  }).join('');
  document.getElementById('login-pin').value = '';
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-pin').focus();
}

function performLogin() {
  const uid = document.getElementById('login-user-select').value;
  const pin = document.getElementById('login-pin').value.trim();
  const errEl = document.getElementById('login-error');
  const u = users.find(function(x) { return x.id === uid; });
  if (!u || String(u.pin) !== pin) {
    errEl.textContent = 'PIN errato. Riprova.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  currentUser = u;
  document.getElementById('auth-overlay').classList.add('hidden');

  const initials = u.name.trim().slice(0, 2).toUpperCase();
  const av = document.getElementById('user-av-initials');
  av.textContent = initials;
  av.style.background = SEC_COLORS[u.sec] || '#eab308';
  const pill = document.getElementById('current-user-pill');
  if (pill) pill.title = u.name + ' (' + u.sec + ')';
  const nameLbl = document.getElementById('user-name-lbl');
  if (nameLbl) {
    nameLbl.textContent = u.name + ' (' + u.sec + ')';
    nameLbl.classList.add('hidden');
  }
  document.getElementById('btn-open-admin').classList.toggle('hidden', u.role !== 'admin');

  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(function() { syncAllFromStorage(false); }, 15000);
  populateYearLists();
  render();
}

function canEditSection(sec) { return currentUser && (currentUser.role === 'admin' || currentUser.sec === sec); }
function canEditTask(t) { return !t || canEditSection(t.sec); }
