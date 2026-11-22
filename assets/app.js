/* =========================================================
   app.js — Modali, controllo duplicati, migrazione Excel,
   tema, eventi e Drag & Drop.
   ========================================================= */

/* -------------------------------------------------------------------------
   TEMA (DEFAULT CHIARO BORDIO | SCURO INSTITUTIONAL STEEL) & SIDEBAR
   ------------------------------------------------------------------------- */
function applyTheme(theme) {
  const t = (theme === 'dark') ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  const thIcon = document.getElementById('theme-toggle-icon');
  const thLbl = document.getElementById('theme-toggle-label');
  if (thIcon) thIcon.textContent = (t === 'dark') ? '☀️' : '🌙';
  if (thLbl) thLbl.textContent = (t === 'dark') ? 'Tema Chiaro' : 'Tema Scuro';
  const authTheme = document.getElementById('btn-theme-auth');
  if (authTheme) authTheme.textContent = (t === 'dark') ? '☀️ Chiaro' : '🌙 Scuro';
}
function toggleTheme() {
  applyTheme((document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark');
}

const RAIL_STATE_KEY = 'OI_RAIL_EXPANDED_PREF';
function setRailExpanded(expanded) {
  const rail = document.getElementById('app-rail');
  if (!rail) return;
  rail.classList.toggle('collapsed', !expanded);
  rail.classList.toggle('expanded', expanded);
  const toggleBtn = document.getElementById('btn-toggle-rail');
  if (toggleBtn) {
    const icon = toggleBtn.querySelector('.toggle-icon') || toggleBtn;
    icon.textContent = expanded ? '◀' : '▶';
    toggleBtn.title = expanded ? 'Comprimi barra (solo icone)' : 'Espandi barra (icone e testo)';
  }
  try { localStorage.setItem(RAIL_STATE_KEY, expanded ? '1' : '0'); } catch (e) {}
}
function toggleRail() {
  const rail = document.getElementById('app-rail');
  setRailExpanded(rail ? rail.classList.contains('collapsed') : false);
}

// Drag & Drop: id della pratica attualmente trascinata
let draggedTaskId = null;

/* -------------------------------------------------------------------------
   DUPLICATI
   ------------------------------------------------------------------------- */
function normalizeText(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9àèéìòù]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findPotentialDuplicatesForDraft(draft, ignoreId) {
  const matches = [];
  const draftYear = draft.insDate ? draft.insDate.slice(0, 4) : String(new Date().getFullYear());
  const draftAto = String(draft.ato || '').trim().toLowerCase();
  const draftProt = String(draft.prot || '').trim().toLowerCase();
  const validProt = draftProt && draftProt !== '//' && draftProt !== '-' && draftProt.length >= 2;
  const draftTitleNorm = normalizeText(draft.title);

  tasks.forEach(function(t) {
    if (ignoreId && t.id === ignoreId) return;
    const reasons = [];
    if (draftAto && t.ato && String(t.ato).trim().toLowerCase() === draftAto && t.sec === draft.sec && getTaskYear(t) === draftYear) {
      reasons.push('Stesso ATO (' + t.ato + ') in ' + t.sec + ' ' + draftYear);
    }
    if (validProt && t.prot && String(t.prot).trim().toLowerCase() === draftProt) {
      reasons.push('Stesso Protocollo (' + t.prot + ')');
    }
    const tNorm = normalizeText(t.title);
    if (draftTitleNorm.length >= 10 && tNorm.length >= 10) {
      if (tNorm === draftTitleNorm || (draftTitleNorm.length >= 18 && (tNorm.includes(draftTitleNorm) || draftTitleNorm.includes(tNorm)))) {
        reasons.push('Oggetto identico/simile');
      }
    }
    if (reasons.length > 0) matches.push({ task: t, reasons: reasons });
  });
  return matches;
}

function updateModalDuplicateWarning() {
  const box = document.getElementById('modal-dup-warning');
  const draft = {
    sec: document.getElementById('t-sec').value,
    ato: document.getElementById('t-ato').value,
    prot: document.getElementById('t-prot').value,
    title: document.getElementById('t-title').value,
    insDate: document.getElementById('t-ins-date').value
  };
  const dups = findPotentialDuplicatesForDraft(draft, document.getElementById('t-id').value);
  if (!dups.length) { box.classList.add('hidden'); box.innerHTML = ''; return []; }
  box.innerHTML = '<b>⚠️ Possibile duplicato rilevato:</b>' +
    dups.slice(0, 3).map(function(m) {
      return '<div>• <span class="code-badge">' + escapeHtml(m.task.code || '-') + '</span> <b>[' + m.task.sec + ']</b> ' +
             escapeHtml(m.task.title.slice(0, 80)) + ' <i>(' + escapeHtml(m.reasons.join(', ')) + ')</i></div>';
    }).join('');
  box.classList.remove('hidden');
  return dups;
}

function openDuplicatesModal() {
  const groups = [], atoMap = {}, protMap = {}, titleMap = {};
  tasks.forEach(function(t) {
    const yr = getTaskYear(t), ato = String(t.ato || '').trim().toLowerCase();
    if (ato) { const k = t.sec + '|' + yr + '|' + ato; (atoMap[k] = atoMap[k] || []).push(t); }
    const prot = String(t.prot || '').trim().toLowerCase();
    if (prot && prot !== '//' && prot !== '-' && prot.length >= 2) (protMap[prot] = protMap[prot] || []).push(t);
    const tn = normalizeText(t.title);
    if (tn.length >= 10) (titleMap[tn] = titleMap[tn] || []).push(t);
  });
  Object.keys(atoMap).forEach(function(k) { if (atoMap[k].length > 1) groups.push({ reason: 'Stesso ATO (' + atoMap[k][0].ato + ') — ' + atoMap[k][0].sec + ' ' + getTaskYear(atoMap[k][0]), items: atoMap[k] }); });
  Object.keys(protMap).forEach(function(k) { if (protMap[k].length > 1) groups.push({ reason: 'Stesso Protocollo (' + protMap[k][0].prot + ')', items: protMap[k] }); });
  Object.keys(titleMap).forEach(function(k) { if (titleMap[k].length > 1) groups.push({ reason: 'Stesso Oggetto', items: titleMap[k] }); });

  const container = document.getElementById('dups-list-container');
  if (!groups.length) {
    container.innerHTML = '<div style="padding:24px; text-align:center; color:#16a34a; font-weight:700; background:var(--surface-sub); border-radius:8px; border:1px solid var(--border);">✓ Nessun duplicato trovato nell\'archivio!</div>';
  } else {
    container.innerHTML = groups.map(function(g) {
      return '<div class="dup-group"><div style="font-weight:700; font-size:0.84rem; color:#f97316;">⚠️ ' + escapeHtml(g.reason) + ' (' + g.items.length + ')</div>' +
        g.items.map(function(t) {
          const ed = canEditTask(t);
          return '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 8px; background:var(--panel); border-radius:6px; border:1px solid var(--border); font-size:0.8rem;">' +
            '<div style="min-width:0; flex:1;"><span class="code-badge">' + escapeHtml(t.code || '-') + '</span> <span class="sec-badge sec-' + t.sec + '">' + t.sec + '</span> <b>' + escapeHtml(t.title) + '</b> <small style="color:var(--muted);">[' + escapeHtml(t.status) + ']</small></div>' +
            '<div style="display:flex; gap:5px;"><button type="button" class="std-btn" data-dup-action="edit" data-id="' + t.id + '">' + (ed ? '✏️ Apri' : '👁️') + '</button>' + (ed ? '<button type="button" class="std-btn btn-danger" data-dup-action="delete" data-id="' + t.id + '">🗑</button>' : '') + '</div></div>';
        }).join('') + '</div>';
    }).join('');
  }
  document.getElementById('modal-dups').classList.remove('hidden');
}

/* -------------------------------------------------------------------------
   MODALE TASK
   ------------------------------------------------------------------------- */
function updateCodePreviewForNewTask() {
  if (document.getElementById('t-id').value) return;
  const sec = document.getElementById('t-sec').value;
  const ins = document.getElementById('t-ins-date').value;
  const preview = computeNextCodeFromList(tasks, sec, ins ? ins.slice(0, 4) : String(new Date().getFullYear()));
  document.getElementById('t-code-display').value = preview + ' (anteprima)';
  document.getElementById('modal-code-badge').textContent = preview;
}

function openModal(id) {
  const t = id ? tasks.find(function(x) { return x.id === id; }) : null;
  const todayISO = toISODateLocal(new Date());
  const editable = t ? canEditTask(t) : true;
  const isAdmin = currentUser && currentUser.role === 'admin';

  document.getElementById('modal-title').textContent = t ? 'Dettaglio Pratica' : 'Nuova Pratica / Task';
  document.getElementById('modal-readonly-tag').classList.toggle('hidden', editable);
  document.getElementById('btn-save-task').classList.toggle('hidden', !editable);
  document.getElementById('btn-delete-in-modal').classList.toggle('hidden', !(t && editable));

  document.getElementById('t-id').value = t ? t.id : '';
  document.getElementById('t-code').value = t ? (t.code || '') : '';
  document.getElementById('t-ato').value = t ? (t.ato || '') : '';
  document.getElementById('t-sec').value = t ? t.sec : (isAdmin ? (activeSecFilter || 'NATO') : currentUser.sec);
  document.getElementById('t-tipo').value = t ? (t.tipo || 'Appunto') : 'Appunto';
  document.getElementById('t-title').value = t ? t.title : '';
  document.getElementById('t-prio').value = t ? (t.prio || 'Ordinario') : 'Ordinario';
  document.getElementById('t-class').value = t ? (t.classif || 'Non Classificato') : 'Non Classificato';
  document.getElementById('t-dest').value = t ? normalizeApprover(t.dest) : 'CR';
  document.getElementById('t-ins-date').value = t ? (t.insDate || todayISO) : todayISO;
  document.getElementById('t-pcn-out').value = t ? (t.pcnOut || '') : '';
  document.getElementById('t-pcn-in').value = t ? (t.pcnIn || '') : '';
  document.getElementById('t-date').value = t ? (t.date || '') : '';
  document.getElementById('t-time').value = t ? (t.time || '12:00') : '12:00';
  document.getElementById('t-status').value = t ? (t.status || 'In lavorazione') : 'In lavorazione';
  document.getElementById('t-prot').value = t ? (t.prot || '') : '';
  document.getElementById('t-link').value = t ? (t.link || '') : '';
  document.getElementById('t-notes').value = t ? (t.notes || '') : '';
  document.getElementById('t-mid-done').checked = t ? Boolean(t.midDone) : false;

  if (t && t.code) {
    document.getElementById('t-code-display').value = t.code;
    document.getElementById('modal-code-badge').textContent = t.code;
  } else {
    updateCodePreviewForNewTask();
  }

  ['t-ato','t-sec','t-tipo','t-title','t-prio','t-class','t-dest','t-ins-date','t-pcn-out','t-pcn-in','t-date','t-time','t-status','t-prot','t-link','t-notes','t-mid-done'].forEach(function(fid) {
    document.getElementById(fid).disabled = !editable || (fid === 't-sec' && !isAdmin);
  });

  const auditBox = document.getElementById('t-audit-box');
  if (t && (t.updatedBy || t.createdBy)) {
    let html = '';
    if (t.updatedBy) html += '<div>🕒 <b>Ultima modifica:</b> ' + escapeHtml(t.updatedBy) + ' — ' + formatTimestamp(t.updatedAt) + '</div>';
    if (t.createdBy) html += '<div style="color:var(--muted); font-size:0.73rem;">Creato da: ' + escapeHtml(t.createdBy) + ' il ' + formatTimestamp(t.createdAt) + '</div>';
    auditBox.innerHTML = html;
    auditBox.classList.remove('hidden');
  } else {
    auditBox.classList.add('hidden');
  }

  updateModalDuplicateWarning();
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); }

let toastTimerId = null;
function showToast(msg) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimerId) clearTimeout(toastTimerId);
  toastTimerId = setTimeout(function() { el.classList.remove('show'); }, 3000);
}

async function openOrCopyLink(rawLink) {
  const link = String(rawLink || '').trim();
  if (!link) {
    showToast('⚠️ Nessun link o percorso allegato');
    return;
  }

  // 1. Link Web (SharePoint, Intranet, HTTPS/HTTP): apertura diretta nel browser
  if (/^https?:\/\//i.test(link)) {
    window.open(link, '_blank');
    showToast('🌐 Link aperto in una nuova scheda');
    return;
  }

  // Copia sempre negli appunti il percorso originale
  try {
    await navigator.clipboard.writeText(link);
  } catch (err) {}

  // 2. Normalizzazione del percorso per i protocolli Windows
  const cleanPath = link.replace(/^file:\/\/\/?/i, '').replace(/\//g, '\\');
  const fileUrl = 'file:///' + cleanPath.replace(/\\/g, '/');

  // 3. Documenti Microsoft Office: apertura diretta in app desktop senza download
  if (/\.(docx?|docm)$/i.test(cleanPath)) {
    window.location.href = 'ms-word:ofe|u|' + fileUrl;
    showToast('📝 Apertura in Microsoft Word... (percorso copiato)');
    return;
  }
  if (/\.(xlsx?|xlsm|xlsb)$/i.test(cleanPath)) {
    window.location.href = 'ms-excel:ofe|u|' + fileUrl;
    showToast('📊 Apertura in Microsoft Excel... (percorso copiato)');
    return;
  }
  if (/\.(pptx?|pptm)$/i.test(cleanPath)) {
    window.location.href = 'ms-powerpoint:ofe|u|' + fileUrl;
    showToast('📑 Apertura in Microsoft PowerPoint... (percorso copiato)');
    return;
  }

  // 4. Cartelle Windows / LAN: copia negli appunti e istruzioni rapide
  const isFolder = !/\.[a-zA-Z0-9]{2,5}$/.test(cleanPath);
  if (isFolder) {
    try { window.location.href = 'search-ms:crumb=location:' + cleanPath; } catch (e) {}
    showToast('📋 Percorso copiato! Premi Win+R e poi Invio per aprirla subito');
    return;
  }

  // 5. File generici (es. PDF, archivi): copia il percorso
  showToast('📋 Percorso copiato! Premi Win+R e poi Invio (o incolla in Esplora File)');
}

async function saveTask() {
  const title = document.getElementById('t-title').value.trim();
  if (!title) { alert('Inserisci l\'Oggetto della pratica.'); return; }
  const sec = document.getElementById('t-sec').value;
  if (!canEditSection(sec)) { alert('Non hai i permessi per modificare la sezione ' + sec + '.'); return; }

  const existingId = document.getElementById('t-id').value;
  const oldTask = existingId ? tasks.find(function(x) { return x.id === existingId; }) : null;
  if (oldTask && !canEditTask(oldTask)) { alert('Accesso negato.'); return; }

  const dups = updateModalDuplicateWarning();
  if (dups.length > 0 && !confirm('Possibile duplicato rilevato (' + (dups[0].task.code || '') + ' — ' + dups[0].reasons.join(', ') + ').\n\nVuoi salvare comunque?')) return;

  const nowISO = new Date().toISOString();
  const userLabel = currentUser.name + ' (' + currentUser.sec + ')';
  const insDate = document.getElementById('t-ins-date').value || toISODateLocal(new Date());
  const id = existingId || ('TSK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5));
  let code = (oldTask && oldTask.code) ? oldTask.code : await generateSafeAutoCode(sec, insDate.slice(0, 4));

  const item = {
    id: id, code: code, ato: document.getElementById('t-ato').value.trim(), sec: sec,
    tipo: document.getElementById('t-tipo').value, title: title,
    prio: document.getElementById('t-prio').value, classif: document.getElementById('t-class').value,
    dest: document.getElementById('t-dest').value, insDate: insDate,
    pcnOut: document.getElementById('t-pcn-out').value, pcnIn: document.getElementById('t-pcn-in').value,
    date: document.getElementById('t-date').value, time: document.getElementById('t-time').value || '12:00',
    status: document.getElementById('t-status').value, prot: document.getElementById('t-prot').value.trim(),
    link: document.getElementById('t-link').value.trim(), notes: document.getElementById('t-notes').value.trim(),
    midDone: document.getElementById('t-mid-done').checked,
    createdBy: oldTask ? (oldTask.createdBy || userLabel) : userLabel,
    createdAt: oldTask ? (oldTask.createdAt || nowISO) : nowISO,
    updatedBy: userLabel, updatedAt: nowISO
  };

  const diffs = [];
  if (oldTask) {
    if (oldTask.status !== item.status) diffs.push('Stato: ' + oldTask.status + ' → ' + item.status);
    if (oldTask.date !== item.date || oldTask.time !== item.time) diffs.push('Scadenza: ' + (oldTask.date||'-') + ' → ' + (item.date||'-') + ' ' + item.time);
    if (oldTask.dest !== item.dest) diffs.push('Approv.: ' + oldTask.dest + ' → ' + item.dest);
    if (oldTask.title !== item.title) diffs.push('Oggetto modificato');
    tasks[tasks.findIndex(function(x) { return x.id === id; })] = item;
  } else {
    tasks.push(item);
  }

  isSavingTask = true;
  try {
    await saveSingleTask(item);
    try {
      await appendAuditLog(oldTask ? 'MODIFICATO' : 'CREATO', item.sec, '[' + item.code + '] ' + item.title, oldTask ? (diffs.join(' | ') || 'Aggiornamento pratica') : ('Nuova pratica — ' + item.status));
    } catch (err) {
      console.warn('Errore scrittura log (non bloccante):', err);
    }
  } finally {
    isSavingTask = false;
  }

  if (hideCompleted && isClosedStatus(item.status)) hideCompleted = false;

  const filterNotes = [];
  const secSelect = document.getElementById('f-sec');
  if (secSelect && secSelect.value && secSelect.value !== item.sec) {
    filterNotes.push('sezione');
    secSelect.value = '';
  }
  if (activeSecFilter && activeSecFilter !== item.sec) {
    filterNotes.push('sezione');
    activeSecFilter = '';
  }
  if (activeYearFilter && activeYearFilter !== getTaskYear(item)) {
    filterNotes.push('anno');
    activeYearFilter = '';
  }
  if (filterNotes.length) showToast('Filtro ' + filterNotes.join(' e ') + ' azzerato per mostrare la pratica ' + (item.code || ''));

  populateYearLists();
  closeModal();
  render();
}

async function deleteTaskById(id) {
  const t = tasks.find(function(x) { return x.id === id; });
  if (!t || !canEditTask(t)) { alert('Puoi eliminare solo le pratiche della tua sezione.'); return; }
  if (!confirm('Eliminare definitivamente la pratica ' + (t.code || '') + '?')) return;
  tasks = tasks.filter(function(x) { return x.id !== id; });
  isSavingTask = true;
  try {
    await deleteSingleTaskFile(id);
    await appendAuditLog('ELIMINATO', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Pratica eliminata definitivamente');
  } catch (err) {
    console.warn('Errore scrittura log (non bloccante):', err);
  } finally {
    isSavingTask = false;
  }
  populateYearLists();
  closeModal();
  render();
}

/* -------------------------------------------------------------------------
   LOG, ADMIN, CSV & MIGRAZIONE EXCEL
   ------------------------------------------------------------------------- */
async function openLogModal() {
  await syncAllFromStorage(true);
  renderLogTable();
  document.getElementById('modal-log').classList.remove('hidden');
}

function renderLogTable() {
  const q = document.getElementById('log-search').value.toLowerCase();
  const fSec = document.getElementById('log-filter-sec').value;
  const fAct = document.getElementById('log-filter-action').value;
  const filtered = logs.filter(function(l) {
    if (fSec && l.sec !== fSec) return false;
    if (fAct && l.action !== fAct) return false;
    if (q && ![l.user, l.target, l.details, l.action].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const tbody = document.getElementById('log-table-body');
  tbody.innerHTML = filtered.length ? filtered.slice(0, 300).map(function(l) {
    return '<tr><td style="white-space:nowrap;">' + formatTimestamp(l.ts) + '</td><td><b>' + escapeHtml(l.user) + '</b> <small style="color:var(--muted)">(' + escapeHtml(l.userSec) + ')</small></td><td><span class="sec-badge sec-' + escapeHtml(l.sec) + '">' + escapeHtml(l.sec) + '</span></td><td><span class="log-action-badge la-' + escapeHtml(l.action) + '">' + escapeHtml(l.action) + '</span></td><td>' + escapeHtml(l.target) + '</td><td style="color:var(--text-soft);">' + escapeHtml(l.details) + '</td></tr>';
  }).join('') : '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">Nessuna voce di log.</td></tr>';
}

function downloadCSV(filename, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' }));
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function exportTasksCSV() {
  const headers = ['code','ato','insDate','tipo','sec','prio','classif','title','prot','pcnOut','pcnIn','status','dest','date','time','notes','updatedBy','updatedAt'];
  const rows = [headers.join(';')];
  tasks.forEach(function(t) { rows.push(headers.map(function(h) { return '"' + String(t[h] ?? '').replace(/"/g, '""') + '"'; }).join(';')); });
  downloadCSV('export_task_OI_' + toISODateLocal(new Date()) + '.csv', rows.join('\r\n'));
}

function exportLogCSV() {
  const rows = ['DataOra;Utente;SezioneUtente;SezionePratica;Azione;Pratica;Dettagli'];
  logs.forEach(function(l) {
    rows.push([formatTimestamp(l.ts), l.user, l.userSec, l.sec, l.action, l.target, l.details].map(function(v) { return '"' + String(v||'').replace(/"/g,'""') + '"'; }).join(';'));
  });
  downloadCSV('log_attivita_OI_' + toISODateLocal(new Date()) + '.csv', rows.join('\r\n'));
}

function openAdminModal() {
  if (!currentUser || currentUser.role !== 'admin') return;
  renderAdminUsers();
  document.getElementById('modal-admin').classList.remove('hidden');
}

function renderAdminUsers() {
  document.getElementById('admin-users-tbody').innerHTML = users.map(function(u) {
    const isSelf = currentUser && u.id === currentUser.id;
    return '<tr><td><b>' + escapeHtml(u.name) + '</b>' + (isSelf ? ' <small style="color:var(--today-text);">(Tu)</small>' : '') + '</td><td><span class="sec-badge sec-' + escapeHtml(u.sec) + '">' + escapeHtml(u.sec) + '</span></td><td>' + (u.role === 'admin' ? '🛡️ Amministratore' : '👤 Utente (' + escapeHtml(u.sec) + ')') + '</td><td><code>' + escapeHtml(u.pin) + '</code></td><td style="white-space:nowrap;"><button type="button" class="std-btn" data-adm-action="reset-pin" data-uid="' + u.id + '">🔑 PIN</button> ' + (!isSelf ? '<button type="button" class="std-btn btn-danger" data-adm-action="del-user" data-uid="' + u.id + '">🗑</button>' : '') + '</td></tr>';
  }).join('');
}

async function addAdminUser() {
  const name = document.getElementById('adm-name').value.trim(), role = document.getElementById('adm-role').value;
  let sec = document.getElementById('adm-sec').value;
  const pin = document.getElementById('adm-pin').value.trim();
  if (!name || !pin) { alert('Inserisci Nome e PIN.'); return; }
  if (role === 'admin') sec = 'TUTTE';
  else if (sec === 'TUTTE') { alert('Seleziona una delle 4 sezioni (NATO, UE, ONU, FOI).'); return; }
  users.push({ id: 'USR-' + Date.now(), name: name, sec: sec, role: role, pin: pin });
  await saveUsersToStorage();
  await appendAuditLog('ADMIN', 'ADMIN', 'Utente: ' + name, 'Creato utente (' + role + ' — ' + sec + ')');
  document.getElementById('adm-name').value = '';
  renderAdminUsers();
}

function parseExcelDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date((Math.floor(parseFloat(s)) - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  return m ? (m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0')) : '';
}

async function extractZipEntries(arrayBuffer) {
  const view = new DataView(arrayBuffer), bytes = new Uint8Array(arrayBuffer), entries = {};
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) { if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; } }
  if (eocdOffset < 0) throw new Error('File Excel non valido.');
  const cdCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < cdCount; i++) {
    const method = view.getUint16(cdOffset + 10, true), compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true), extraLen = view.getUint16(cdOffset + 30, true), commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const name = dec.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    if (name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      const lNameLen = view.getUint16(localHeaderOffset + 26, true), lExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen, compData = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) entries[name] = dec.decode(compData);
      else if (method === 8) {
        const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
        w.write(compData); w.close();
        entries[name] = dec.decode(await new Response(ds.readable).arrayBuffer());
      }
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function colToIdx(colStr) { let n = 0; for (let i = 0; i < colStr.length; i++) n = n * 26 + (colStr.charCodeAt(i) - 64); return n - 1; }

async function handleAdminExcelMigration(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const entries = await extractZipEntries(await file.arrayBuffer());
    const parser = new DOMParser(), sharedStrings = [];
    if (entries['xl/sharedStrings.xml']) {
      const siNodes = parser.parseFromString(entries['xl/sharedStrings.xml'], 'application/xml').getElementsByTagName('si');
      for (let i = 0; i < siNodes.length; i++) {
        let txt = ''; const tNodes = siNodes[i].getElementsByTagName('t');
        for (let j = 0; j < tNodes.length; j++) txt += tNodes[j].textContent;
        sharedStrings.push(txt.trim());
      }
    }
    const extracted = [];
    Object.keys(entries).forEach(function(k) {
      if (!k.startsWith('xl/worksheets/sheet')) return;
      const rowNodes = parser.parseFromString(entries[k], 'application/xml').getElementsByTagName('row');
      for (let r = 0; r < rowNodes.length; r++) {
        const cells = rowNodes[r].getElementsByTagName('c'), vals = [];
        for (let c = 0; c < cells.length; c++) {
          const ref = cells[c].getAttribute('r') || '', colLetters = ref.replace(/\d+/g, '');
          const colIdx = colLetters ? colToIdx(colLetters) : c;
          const type = cells[c].getAttribute('t'), vNode = cells[c].getElementsByTagName('v')[0], isNode = cells[c].getElementsByTagName('is')[0];
          let val = '';
          if (type === 's' && vNode) val = sharedStrings[parseInt(vNode.textContent, 10)] || '';
          else if (type === 'inlineStr' && isNode) val = isNode.textContent.trim();
          else if (vNode) val = vNode.textContent.trim();
          vals[colIdx] = val;
        }
        const sec = String(vals[3] || '').toUpperCase().trim();
        if (['NATO', 'UE', 'ONU', 'FOI'].includes(sec) && vals[6] && String(vals[6]).toUpperCase() !== 'OGGETTO') {
          extracted.push({
            ato: String(vals[0] || '').trim(), insDate: parseExcelDate(vals[1]), tipo: String(vals[2] || '').trim() || 'Appunto',
            sec: sec, prio: String(vals[4] || '').trim() || 'Ordinario', classif: String(vals[5] || '').trim() || 'Non Classificato',
            title: String(vals[6] || '').trim(), prot: String(vals[7] || '').trim() || '//',
            pcnOut: parseExcelDate(vals[8]), pcnIn: parseExcelDate(vals[9]),
            status: String(vals[10] || '').trim() || 'In lavorazione', dest: normalizeApprover(vals[11])
          });
        }
      }
    });
    e.target.value = '';
    if (!extracted.length) { alert('Nessuna riga valida trovata.'); return; }
    let added = 0; const nowISO = new Date().toISOString(), uLabel = currentUser.name + ' (Migrazione Excel)';
    for (let i = 0; i < extracted.length; i++) {
      const r = extracted[i];
      if (!tasks.some(function(x) { return (r.ato && x.ato === r.ato && x.sec === r.sec) || (x.title.toLowerCase() === r.title.toLowerCase() && x.sec === r.sec); })) {
        const item = Object.assign({
          id: 'XL-' + Date.now() + '-' + i, code: computeNextCodeFromList(tasks, r.sec, r.insDate ? r.insDate.slice(0, 4) : String(new Date().getFullYear())),
          date: '', time: '12:00', notes: '', link: '', midDone: false, createdBy: uLabel, createdAt: nowISO, updatedBy: uLabel, updatedAt: nowISO
        }, r);
        tasks.push(item); await saveSingleTask(item); added++;
      }
    }
    await appendAuditLog('ADMIN', 'ADMIN', 'Migrazione Excel', 'Importate ' + added + ' pratiche da ' + file.name);
    populateYearLists(); render();
    alert('Migrazione completata: importate ' + added + ' pratiche.');
  } catch (err) { alert('Errore Excel: ' + err.message); }
}

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const firstLine = text.split(/\r\n|\r|\n/)[0] || '';
  const delimiter = (firstLine.includes(';') || !firstLine.includes(',')) ? ';' : ',';

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

async function handleAdminCsvImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      alert('Il file CSV selezionato è vuoto o non contiene dati.');
      e.target.value = '';
      return;
    }

    const headerRow = rows[0].map(function(h) { return h.trim().toLowerCase(); });
    const colIndex = {};
    headerRow.forEach(function(h, idx) { colIndex[h] = idx; });

    function getVal(row, colName) {
      const idx = colIndex[colName.toLowerCase()];
      return (idx !== undefined && row[idx] !== undefined) ? String(row[idx]).trim() : '';
    }

    let addedCount = 0;
    let updatedCount = 0;
    const nowISO = new Date().toISOString();
    const uLabel = (currentUser ? currentUser.name : 'Admin') + ' (Import CSV)';

    isSavingTask = true;
    try {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const title = getVal(row, 'title') || getVal(row, 'oggetto');
        if (!title) continue;

        let sec = (getVal(row, 'sec') || getVal(row, 'sezione') || 'NATO').toUpperCase();
        if (!['NATO', 'UE', 'ONU', 'FOI'].includes(sec)) sec = 'NATO';

        const insDate = getVal(row, 'insdate') || getVal(row, 'inserimento') || toISODateLocal(new Date());
        let code = getVal(row, 'code') || getVal(row, 'codice');
        if (!code) {
          code = computeNextCodeFromList(tasks, sec, insDate ? insDate.slice(0, 4) : String(new Date().getFullYear()));
        }

        const rowData = {
          code: code,
          ato: getVal(row, 'ato'),
          insDate: insDate,
          tipo: getVal(row, 'tipo') || getVal(row, 'tipologia') || 'Appunto',
          sec: sec,
          prio: getVal(row, 'prio') || getVal(row, 'priorità') || 'Ordinario',
          classif: getVal(row, 'classif') || getVal(row, 'classifica') || 'Non Classificato',
          title: title,
          prot: getVal(row, 'prot') || getVal(row, 'protocollo') || '//',
          pcnOut: getVal(row, 'pcnout') || getVal(row, 'pcn out') || '',
          pcnIn: getVal(row, 'pcnin') || getVal(row, 'pcn in') || '',
          status: getVal(row, 'status') || getVal(row, 'stato') || 'In lavorazione',
          dest: normalizeApprover(getVal(row, 'dest') || getVal(row, 'approvatore')),
          date: getVal(row, 'date') || getVal(row, 'scadenza') || '',
          time: getVal(row, 'time') || getVal(row, 'ora') || '12:00',
          notes: getVal(row, 'notes') || getVal(row, 'note') || '',
          link: getVal(row, 'link') || ''
        };

        const existingIndex = tasks.findIndex(function(x) {
          return (x.code && x.code === code && x.sec === sec);
        });

        if (existingIndex >= 0) {
          const existing = tasks[existingIndex];
          const updatedItem = Object.assign({}, existing, rowData, {
            updatedBy: uLabel,
            updatedAt: nowISO
          });
          tasks[existingIndex] = updatedItem;
          await saveSingleTask(updatedItem);
          updatedCount++;
        } else {
          const newId = 'TSK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + i;
          const newItem = Object.assign({
            id: newId,
            midDone: false,
            createdBy: getVal(row, 'updatedby') || uLabel,
            createdAt: getVal(row, 'updatedat') || nowISO,
            updatedBy: uLabel,
            updatedAt: nowISO
          }, rowData);
          tasks.push(newItem);
          await saveSingleTask(newItem);
          addedCount++;
        }
      }

      await appendAuditLog('ADMIN', 'ADMIN', 'Import CSV', 'Importate ' + addedCount + ' nuove pratiche, ' + updatedCount + ' aggiornate da ' + file.name);
    } finally {
      isSavingTask = false;
    }

    e.target.value = '';
    populateYearLists();
    render();
    alert('Importazione completata con successo!\n\n• ' + addedCount + ' nuove pratiche aggiunte\n• ' + updatedCount + ' pratiche aggiornate\n(File: ' + file.name + ')');
  } catch (err) {
    alert('Errore durante l\'importazione CSV: ' + err.message);
  }
}

/* -------------------------------------------------------------------------
   AVVIO ED EVENT LISTENERS
   ------------------------------------------------------------------------- */
// Pulsante ⚡ di riconnessione rapida: appare solo se c'è un handle in IndexedDB.
async function refreshQuickReconnect() {
  const saved = await getSavedDirHandle();
  const step = document.getElementById('auth-step-folder');
  if (!step) return;
  let btn = document.getElementById('btn-quick-reconnect');
  if (!saved) {
    if (btn) btn.classList.add('hidden');
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-quick-reconnect';
    btn.className = 'btn-add';
    btn.style.cssText = 'padding:11px; font-size:0.92rem; width:100%; background:#15803d;';
    btn.addEventListener('click', reconnectSavedFolder);
    step.insertBefore(btn, document.getElementById('btn-connect-folder'));
  }
  btn.textContent = '⚡ Riconnetti a ' + saved.name + ' (1 clic)';
  btn.classList.remove('hidden');
}

function initApp() {
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {}
  applyTheme(savedTheme);

  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('btn-theme-auth').addEventListener('click', toggleTheme);

  // Barra Laterale Unificata: Collassabile / Espandibile
  let savedRailExp = false;
  try { savedRailExp = localStorage.getItem(RAIL_STATE_KEY) === '1'; } catch (e) {}
  setRailExpanded(savedRailExp);
  const railToggleBtn = document.getElementById('btn-toggle-rail');
  if (railToggleBtn) railToggleBtn.addEventListener('click', toggleRail);

  const railBrand = document.querySelector('.rail-brand');
  if (railBrand) {
    railBrand.addEventListener('click', function() {
      const rail = document.getElementById('app-rail');
      if (rail && rail.classList.contains('collapsed')) setRailExpanded(true);
    });
  }

  // Popover Archivio per Anno
  const railYearBtn = document.getElementById('rail-btn-year');
  const popoverYears = document.getElementById('popover-years');
  if (railYearBtn && popoverYears) {
    railYearBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      popoverYears.classList.toggle('hidden');
    });
    popoverYears.addEventListener('click', function(e) {
      const item = e.target.closest('[data-yr]');
      if (!item) return;
      activeYearFilter = item.getAttribute('data-yr') || '';
      popoverYears.classList.add('hidden');
      populateYearLists();
      render();
    });
    document.addEventListener('click', function(e) {
      if (!popoverYears.classList.contains('hidden') && !popoverYears.contains(e.target) && !railYearBtn.contains(e.target)) {
        popoverYears.classList.add('hidden');
      }
    });
  }

  document.getElementById('btn-connect-folder').addEventListener('click', initSharedFolder);
  document.getElementById('btn-use-local-fallback').addEventListener('click', initLocalFallback);
  if (!isAdminSetupMode()) {
    const localFallbackBtn = document.getElementById('btn-use-local-fallback');
    if (localFallbackBtn) localFallbackBtn.classList.add('hidden');
    if (typeof window !== 'undefined' && window.EXPECTED_DB_HINT) {
      const authInfo = document.querySelector('#auth-step-folder .auth-info');
      if (authInfo) {
        authInfo.innerHTML = '<b>Passo 1 — Collega l\'Archivio dell\'Ufficio</b><br>' +
          'Seleziona la <b>cartella condivisa sul server locale</b>: <code>' + escapeHtml(window.EXPECTED_DB_HINT) + '</code>.<br>' +
          'Ogni pratica viene salvata come file indipendente con codice automatico (es. <code>N26-001</code>).';
      }
    }
  }
  document.getElementById('btn-change-folder').addEventListener('click', function() {
    document.getElementById('auth-step-login').classList.add('hidden');
    document.getElementById('auth-step-folder').classList.remove('hidden');
    refreshQuickReconnect();
  });
  if (typeof window.showDirectoryPicker === 'function') refreshQuickReconnect();
  document.getElementById('btn-do-login').addEventListener('click', performLogin);
  document.getElementById('login-pin').addEventListener('keydown', function(e) { if (e.key === 'Enter') performLogin(); });
  document.getElementById('btn-logout').addEventListener('click', function() {
    currentUser = null;
    if (syncIntervalId) clearInterval(syncIntervalId);
    document.getElementById('auth-overlay').classList.remove('hidden');
    showLoginStep(storageMode === 'fs' ? '📁 Archivio connesso: <b>' + escapeHtml(rootDirHandle.name) + '</b>' : '💻 Modalità Locale', false);
    refreshQuickReconnect();
  });

  // Navigazione viste (Topbar + Tool Rail)
  ['board', 'list', 'cal', 'stats'].forEach(function(v) {
    document.getElementById('btn-view-' + v).addEventListener('click', function() { setView(v); });
    document.getElementById('rail-' + v).addEventListener('click', function() { setView(v); });
  });
  document.getElementById('btn-grp-status').addEventListener('click', function() { setKanbanGroup('status'); });
  document.getElementById('btn-grp-sec').addEventListener('click', function() { setKanbanGroup('sec'); });

  // Filtro Sezioni in Topbar
  const fSec = document.getElementById('f-sec');
  if (fSec) fSec.addEventListener('change', render);

  document.getElementById('btn-notif-crit').addEventListener('click', function() {
    onlyCriticalFilter = !onlyCriticalFilter;
    render();
  });

  document.getElementById('btn-new-task').addEventListener('click', function() { openModal(null); });
  document.getElementById('btn-sync-now').addEventListener('click', function() { syncAllFromStorage(false); });
  document.getElementById('btn-open-log').addEventListener('click', openLogModal);
  document.getElementById('btn-close-log').addEventListener('click', function() { document.getElementById('modal-log').classList.add('hidden'); });
  document.getElementById('btn-export-log-csv').addEventListener('click', exportLogCSV);
  document.getElementById('log-search').addEventListener('input', renderLogTable);
  document.getElementById('log-filter-sec').addEventListener('change', renderLogTable);
  document.getElementById('log-filter-action').addEventListener('change', renderLogTable);

  document.getElementById('btn-check-dups').addEventListener('click', openDuplicatesModal);
  document.getElementById('btn-rail-dups').addEventListener('click', openDuplicatesModal);
  document.getElementById('btn-close-dups').addEventListener('click', function() { document.getElementById('modal-dups').classList.add('hidden'); });
  document.getElementById('btn-print-stats').addEventListener('click', function() { window.print(); });
  document.getElementById('stats-year').addEventListener('change', renderStats);
  document.getElementById('stats-sec').addEventListener('change', renderStats);

  document.getElementById('dups-list-container').addEventListener('click', async function(e) {
    const btn = e.target.closest('[data-dup-action]'); if (!btn) return;
    const act = btn.getAttribute('data-dup-action'), id = btn.getAttribute('data-id');
    if (act === 'edit') { document.getElementById('modal-dups').classList.add('hidden'); openModal(id); }
    else if (act === 'delete') { await deleteTaskById(id); openDuplicatesModal(); }
  });

  ['t-sec', 't-ins-date'].forEach(function(fid) {
    document.getElementById(fid).addEventListener('change', function() { updateCodePreviewForNewTask(); updateModalDuplicateWarning(); });
  });
  ['t-ato', 't-prot', 't-title'].forEach(function(fid) {
    document.getElementById(fid).addEventListener('input', updateModalDuplicateWarning);
  });

  document.getElementById('btn-open-admin').addEventListener('click', openAdminModal);
  document.getElementById('btn-close-admin').addEventListener('click', function() { document.getElementById('modal-admin').classList.add('hidden'); });
  document.getElementById('btn-adm-add-user').addEventListener('click', addAdminUser);
  document.getElementById('btn-admin-import-csv').addEventListener('click', function() { document.getElementById('csv-file').click(); });
  document.getElementById('csv-file').addEventListener('change', handleAdminCsvImport);
  document.getElementById('btn-admin-import-excel').addEventListener('click', function() { document.getElementById('excel-file').click(); });
  document.getElementById('excel-file').addEventListener('change', handleAdminExcelMigration);
  document.getElementById('btn-export-csv').addEventListener('click', exportTasksCSV);

  document.getElementById('admin-users-tbody').addEventListener('click', async function(e) {
    const btn = e.target.closest('[data-adm-action]'); if (!btn) return;
    const act = btn.getAttribute('data-adm-action'), uid = btn.getAttribute('data-uid');
    const u = users.find(function(x) { return x.id === uid; }); if (!u) return;
    if (act === 'reset-pin') {
      const p = prompt('Nuovo PIN per ' + u.name + ':', u.pin);
      if (p && p.trim()) { u.pin = p.trim(); await saveUsersToStorage(); await appendAuditLog('ADMIN', 'ADMIN', 'Utente: ' + u.name, 'PIN aggiornato'); renderAdminUsers(); }
    } else if (act === 'del-user') {
      if (confirm('Eliminare utente ' + u.name + '?')) { users = users.filter(function(x) { return x.id !== uid; }); await saveUsersToStorage(); await appendAuditLog('ADMIN', 'ADMIN', 'Utente: ' + u.name, 'Utente rimosso'); renderAdminUsers(); }
    }
  });

  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('btn-save-task').addEventListener('click', saveTask);
  document.getElementById('btn-delete-in-modal').addEventListener('click', function() {
    const id = document.getElementById('t-id').value;
    if (id) deleteTaskById(id);
  });

  document.getElementById('btn-prev-period').addEventListener('click', function() { if (calMode === 'week') calDate.setDate(calDate.getDate() - 7); else calDate.setMonth(calDate.getMonth() - 1); render(); });
  document.getElementById('btn-next-period').addEventListener('click', function() { if (calMode === 'week') calDate.setDate(calDate.getDate() + 7); else calDate.setMonth(calDate.getMonth() + 1); render(); });
  document.getElementById('btn-cal-today').addEventListener('click', function() { calDate = new Date(); render(); });
  document.getElementById('btn-cal-month').addEventListener('click', function() { calMode = 'month'; document.getElementById('btn-cal-month').classList.add('btn-active'); document.getElementById('btn-cal-week').classList.remove('btn-active'); render(); });
  document.getElementById('btn-cal-week').addEventListener('click', function() { calMode = 'week'; document.getElementById('btn-cal-week').classList.add('btn-active'); document.getElementById('btn-cal-month').classList.remove('btn-active'); render(); });

  document.getElementById('f-search').addEventListener('input', render);
  document.getElementById('f-tipo').addEventListener('change', render);
  document.getElementById('f-dest').addEventListener('change', render);
  document.getElementById('f-status').addEventListener('change', function() { if (isClosedStatus(this.value)) hideCompleted = false; render(); });
  document.getElementById('f-sort').addEventListener('change', render);
  document.getElementById('btn-toggle-completed').addEventListener('click', function() {
    hideCompleted = !hideCompleted;
    if (hideCompleted && isClosedStatus(document.getElementById('f-status').value)) document.getElementById('f-status').value = '';
    render();
  });

  document.querySelectorAll('th.sortable').forEach(function(th) {
    th.addEventListener('click', function() { document.getElementById('f-sort').value = th.getAttribute('data-sort'); render(); });
  });

  // Drag & Drop su Kanban (cambia stato trascinando tra le colonne!)
  const boardEl = document.getElementById('view-board');
  boardEl.addEventListener('dragstart', function(e) {
    const card = e.target.closest('.k-card[data-task-id]');
    if (!card || card.getAttribute('draggable') !== 'true') return;
    draggedTaskId = card.getAttribute('data-task-id');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', draggedTaskId); } catch (err) {}
  });
  boardEl.addEventListener('dragover', function(e) {
    const col = e.target.closest('.k-col[data-k-drop-status]');
    if (!col || !draggedTaskId) return;
    e.preventDefault();
    boardEl.querySelectorAll('.k-col.drag-over').forEach(function(x) { if (x !== col) x.classList.remove('drag-over'); });
    col.classList.add('drag-over');
  });
  boardEl.addEventListener('dragleave', function(e) {
    const col = e.target.closest('.k-col[data-k-drop-status]');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });
  boardEl.addEventListener('drop', async function(e) {
    const col = e.target.closest('.k-col[data-k-drop-status]');
    boardEl.querySelectorAll('.k-col.drag-over').forEach(function(x) { x.classList.remove('drag-over'); });
    if (!col) return;
    e.preventDefault();
    const id = draggedTaskId; draggedTaskId = null;
    const t = tasks.find(function(x) { return x.id === id; });
    const newStatus = col.getAttribute('data-k-drop-status');
    if (!t || !canEditTask(t) || !newStatus || t.status === newStatus) return;
    const oldStatus = t.status;
    t.status = newStatus;
    t.updatedBy = currentUser.name + ' (' + currentUser.sec + ')';
    t.updatedAt = new Date().toISOString();
    isSavingTask = true;
    try {
      await saveSingleTask(t);
      try {
        await appendAuditLog('MODIFICATO', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Kanban Stato: ' + oldStatus + ' → ' + newStatus);
      } catch (err) {
        console.warn('Errore scrittura log (non bloccante):', err);
      }
    } finally {
      isSavingTask = false;
    }
    render();
  });

  // Drag & Drop su Calendario con supporto navigazione tra periodi/mesi
  let calNavHoverTimer = null;
  function bindCalNavDrag(btnEl, direction) {
    if (!btnEl) return;
    btnEl.addEventListener('dragover', function(e) {
      if (!draggedTaskId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!calNavHoverTimer) {
        btnEl.classList.add('drag-nav-active');
        calNavHoverTimer = setTimeout(function() {
          calNavHoverTimer = null;
          btnEl.classList.remove('drag-nav-active');
          if (calMode === 'week') {
            calDate.setDate(calDate.getDate() + (direction * 7));
          } else {
            calDate.setMonth(calDate.getMonth() + direction);
          }
          render();
        }, 450);
      }
    });
    btnEl.addEventListener('dragleave', function(e) {
      if (btnEl.contains(e.relatedTarget)) return;
      if (calNavHoverTimer) {
        clearTimeout(calNavHoverTimer);
        calNavHoverTimer = null;
      }
      btnEl.classList.remove('drag-nav-active');
    });
    btnEl.addEventListener('drop', async function(e) {
      if (calNavHoverTimer) {
        clearTimeout(calNavHoverTimer);
        calNavHoverTimer = null;
      }
      btnEl.classList.remove('drag-nav-active');
      if (!draggedTaskId) return;
      e.preventDefault();
      const id = draggedTaskId;
      draggedTaskId = null;
      window.draggedCardNode = null;
      const stash = document.getElementById('cal-drag-stash');
      if (stash) stash.innerHTML = '';
      const t = tasks.find(function(x) { return x.id === id; });
      if (!t || !canEditTask(t)) return;

      const curParts = (t.date || toISODateLocal(new Date())).split('-');
      const dObj = new Date(parseInt(curParts[0], 10), parseInt(curParts[1], 10) - 1, parseInt(curParts[2], 10) || 1);
      if (calMode === 'week') {
        dObj.setDate(dObj.getDate() + (direction * 7));
      } else {
        dObj.setMonth(dObj.getMonth() + direction);
      }
      const oldStr = (t.date || '-') + ' ' + (t.time || '12:00');
      t.date = toISODateLocal(dObj);
      calDate = new Date(dObj.getFullYear(), dObj.getMonth(), (calMode === 'week' ? dObj.getDate() : 1));
      if (activeYearFilter && activeYearFilter !== String(dObj.getFullYear())) {
        activeYearFilter = '';
      }
      t.updatedBy = currentUser.name + ' (' + currentUser.sec + ')';
      t.updatedAt = new Date().toISOString();
      isSavingTask = true;
      try {
        await saveSingleTask(t);
        try {
          await appendAuditLog('SPOSTATO', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Calendario nav: ' + oldStr + ' → ' + t.date + ' ' + (t.time || '12:00'));
        } catch (err) {}
      } finally {
        isSavingTask = false;
      }
      render();
    });
  }

  bindCalNavDrag(document.getElementById('btn-prev-period'), -1);
  bindCalNavDrag(document.getElementById('btn-next-period'), 1);

  const calGrid = document.getElementById('cal-grid');
  calGrid.addEventListener('dragstart', function(e) {
    const card = e.target.closest('[data-task-id]');
    if (!card || card.getAttribute('draggable') !== 'true') return;
    draggedTaskId = card.getAttribute('data-task-id');
    window.draggedCardNode = card;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', draggedTaskId); } catch (err) {}
  });
  calGrid.addEventListener('dragover', function(e) {
    const dz = e.target.closest('.slot-box[data-drop-date]') || e.target.closest('[data-drop-date]');
    if (!dz || !draggedTaskId) return;
    e.preventDefault();
    calGrid.querySelectorAll('.drag-over').forEach(function(x) { if (x !== dz) x.classList.remove('drag-over'); });
    dz.classList.add('drag-over');
  });
  calGrid.addEventListener('dragleave', function(e) {
    const dz = e.target.closest('[data-drop-date]');
    if (dz && !dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
  });
  calGrid.addEventListener('drop', async function(e) {
    const dz = e.target.closest('.slot-box[data-drop-date]') || e.target.closest('[data-drop-date]');
    calGrid.querySelectorAll('.drag-over').forEach(function(x) { x.classList.remove('drag-over'); });
    if (!dz) return;
    e.preventDefault();
    const id = draggedTaskId;
    draggedTaskId = null;
    window.draggedCardNode = null;
    const stash = document.getElementById('cal-drag-stash');
    if (stash) stash.innerHTML = '';

    const t = tasks.find(function(x) { return x.id === id; });
    const targetDate = dz.getAttribute('data-drop-date'), targetTime = dz.getAttribute('data-drop-time');
    if (!t || !canEditTask(t) || !targetDate) return;
    const oldStr = (t.date || '-') + ' ' + (t.time || '12:00');
    t.date = targetDate;
    if (targetTime) t.time = targetTime; else if (!t.time) t.time = '12:00';

    // Auto-navigazione: se il giorno appartiene a un altro mese/anno, porta calDate sul mese del giorno rilasciato
    const dp = targetDate.split('-');
    if (dp.length === 3) {
      const dropY = parseInt(dp[0], 10), dropM = parseInt(dp[1], 10) - 1;
      if (calDate.getFullYear() !== dropY || calDate.getMonth() !== dropM) {
        calDate = new Date(dropY, dropM, 1);
        if (activeYearFilter && activeYearFilter !== String(dropY)) {
          activeYearFilter = '';
        }
      }
    }

    t.updatedBy = currentUser.name + ' (' + currentUser.sec + ')';
    t.updatedAt = new Date().toISOString();
    isSavingTask = true;
    try {
      await saveSingleTask(t);
      try {
        await appendAuditLog('SPOSTATO', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Calendario: ' + oldStr + ' → ' + t.date + ' ' + t.time);
      } catch (err) {
        console.warn('Errore scrittura log (non bloccante):', err);
      }
    } finally {
      isSavingTask = false;
    }
    render();
  });

  window.addEventListener('dragend', function() {
    if (calNavHoverTimer) {
      clearTimeout(calNavHoverTimer);
      calNavHoverTimer = null;
    }
    document.querySelectorAll('.drag-nav-active').forEach(function(b) { b.classList.remove('drag-nav-active'); });
    draggedTaskId = null;
    window.draggedCardNode = null;
    const stash = document.getElementById('cal-drag-stash');
    if (stash) stash.innerHTML = '';
  });

  // Click delegato su main
  document.getElementById('app-main').addEventListener('click', async function(e) {
    const target = e.target.closest('[data-action]'); if (!target) return;
    const action = target.getAttribute('data-action'), id = target.getAttribute('data-id');
    const t = tasks.find(function(x) { return x.id === id; }); if (!t) return;
    if (action === 'edit') {
      openModal(id);
    } else if (action === 'delete') {
      e.stopPropagation();
      await deleteTaskById(id);
    } else if (action === 'mid-ok') {
      e.stopPropagation();
      if (!canEditTask(t)) return;
      t.midDone = true;
      t.updatedBy = currentUser.name + ' (' + currentUser.sec + ')';
      t.updatedAt = new Date().toISOString();
      isSavingTask = true;
      try {
        await saveSingleTask(t);
        try {
          await appendAuditLog('VERIFICA', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Verifica intermedia (-7gg) effettuata');
        } catch (err) {
          console.warn('Errore scrittura log (non bloccante):', err);
        }
      } finally {
        isSavingTask = false;
      }
      render();
    } else if (action === 'open-link') {
      e.stopPropagation();
      openOrCopyLink(t.link);
    }
  });

  const btnOpenLink = document.getElementById('btn-open-link');
  if (btnOpenLink) {
    btnOpenLink.addEventListener('click', function() {
      openOrCopyLink(document.getElementById('t-link').value.trim());
    });
  }

  setInterval(function() { if (currentUser) render(); }, 60000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
