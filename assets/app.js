/* =========================================================
   app.js — Modali, controllo conflitti ottimistico, duplicati,
   migrazione Excel/CSV, tema, eventi e Drag & Drop sicuro.
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

// Stato Drag & Drop e versione caricata nel modale (controllo conflitti)
let draggedTaskId = null;
let editingTaskLoadedUpdatedAt = null;

/* -------------------------------------------------------------------------
   PACCHETTO 2: TEMPLATE PRATICHE PRECOMPILATE
   ------------------------------------------------------------------------- */
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

function addMonthsSafe(y, m, d, deltaMonths) {
  const targetFirst = new Date(y, m + deltaMonths, 1);
  const maxDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  return new Date(targetFirst.getFullYear(), targetFirst.getMonth(), Math.min(d, maxDay));
}

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
      return '<div>• <span class="code-badge">' + escapeHtml(m.task.code || '-') + '</span> <b>[' + escapeHtml(m.task.sec) + ']</b> ' +
             escapeHtml(String(m.task.title || '').slice(0, 80)) + ' <i>(' + escapeHtml(m.reasons.join(', ')) + ')</i></div>';
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
          const safeSec = sanitizeSection(t.sec);
          const safeId = escapeHtml(t.id);
          return '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 8px; background:var(--panel); border-radius:6px; border:1px solid var(--border); font-size:0.8rem;">' +
            '<div style="min-width:0; flex:1;"><span class="code-badge">' + escapeHtml(t.code || '-') + '</span> <span class="sec-badge sec-' + safeSec + '">' + safeSec + '</span> <b>' + escapeHtml(t.title) + '</b> <small style="color:var(--muted);">[' + escapeHtml(t.status) + ']</small></div>' +
            '<div style="display:flex; gap:5px;"><button type="button" class="std-btn" data-dup-action="edit" data-id="' + safeId + '">' + (ed ? '✏️ Apri' : '👁️') + '</button>' + (ed ? '<button type="button" class="std-btn btn-danger" data-dup-action="delete" data-id="' + safeId + '">🗑</button>' : '') + '</div></div>';
        }).join('') + '</div>';
    }).join('');
  }
  document.getElementById('modal-dups').classList.remove('hidden');
}

/* -------------------------------------------------------------------------
   MODALE TASK & CONTROLLO CONFLITTI
   ------------------------------------------------------------------------- */
function updateCodePreviewForNewTask() {
  if (document.getElementById('t-id').value) return;
  const sec = document.getElementById('t-sec').value;
  const ins = document.getElementById('t-ins-date').value;
  const preview = computeNextCodeFromList(tasks, sec, ins ? ins.slice(0, 4) : String(new Date().getFullYear()));
  document.getElementById('t-code-display').value = preview + ' (anteprima)';
  document.getElementById('modal-code-badge').textContent = preview;
}

/* -------------------------------------------------------------------------
   CHECKLIST, STORICO E TAB DELLA MODALE TASK
   ------------------------------------------------------------------------- */
let modalChecklist = [];

function renderModalChecklist(editable) {
  const summaryEl = document.getElementById('t-chk-summary');
  const doneCount = modalChecklist.filter(function(c) { return Boolean(c && c.done); }).length;
  if (summaryEl) summaryEl.textContent = doneCount + '/' + modalChecklist.length;

  const addRow = document.getElementById('t-chk-add-row');
  if (addRow) addRow.style.display = editable ? 'flex' : 'none';

  const listEl = document.getElementById('t-chk-list');
  if (!listEl) return;

  if (modalChecklist.length === 0) {
    listEl.innerHTML = '<div style="font-size:0.76rem; color:var(--muted); font-style:italic; padding:4px 2px;">Nessun passaggio interno definito.</div>';
    return;
  }

  listEl.innerHTML = modalChecklist.map(function(c, idx) {
    const isDone = Boolean(c && c.done);
    const textEsc = escapeHtml(c.text || '');
    return '<div class="chk-item' + (isDone ? ' is-done' : '') + '">' +
      '<label style="display:flex; align-items:center; gap:8px; cursor:' + (editable ? 'pointer' : 'default') + '; flex:1; min-width:0; margin:0;">' +
        '<input type="checkbox" data-chk-toggle="' + idx + '" ' + (isDone ? 'checked' : '') + ' ' + (editable ? '' : 'disabled') + ' style="cursor:pointer;">' +
        '<span class="chk-text" style="word-break:break-word;">' + textEsc + '</span>' +
      '</label>' +
      (editable ? '<button type="button" class="chk-del-btn" data-chk-del="' + idx + '" title="Rimuovi passaggio">✕</button>' : '') +
    '</div>';
  }).join('');
}

function addChecklistItemFromInput() {
  const input = document.getElementById('t-chk-new-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  modalChecklist.push({ text: val, done: false });
  input.value = '';
  renderModalChecklist(true);
}

function setModalTab(tabName) {
  const tabs = document.querySelectorAll('#modal-task-tabs .modal-tab-btn');
  tabs.forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-mtab') === tabName);
  });
  const paneDetails = document.getElementById('modal-pane-details');
  const paneHistory = document.getElementById('modal-pane-history');
  if (paneDetails) paneDetails.classList.toggle('hidden', tabName !== 'details');
  if (paneHistory) paneHistory.classList.toggle('hidden', tabName !== 'history');
}

async function loadAndRenderTaskHistory(taskObj) {
  const countEl = document.getElementById('modal-hist-count');
  const listEl = document.getElementById('modal-task-history-list');
  if (!listEl) return;

  if (!taskObj) {
    if (countEl) countEl.textContent = '0';
    listEl.innerHTML = '<div style="font-size:0.78rem; color:var(--muted); font-style:italic; padding:12px; text-align:center;">Salva prima la pratica per registrarne la cronologia delle modifiche.</div>';
    return;
  }

  if (storageMode === 'fs' && logs.length === 0) {
    try { await syncAllFromStorage(true, false); } catch (e) {}
  }

  const codeTag = taskObj.code ? ('[' + taskObj.code + ']') : '';
  const taskLogs = logs.filter(function(l) {
    if (!l) return false;
    if (codeTag && l.target && l.target.includes(codeTag)) return true;
    if (l.target && l.target.includes(taskObj.id)) return true;
    return false;
  });

  if (countEl) countEl.textContent = taskLogs.length;

  if (taskLogs.length === 0) {
    listEl.innerHTML = '<div style="font-size:0.78rem; color:var(--muted); font-style:italic; padding:12px; text-align:center;">Nessuna operazione registrata per questa pratica nell\'Audit Log.</div>';
    return;
  }

  listEl.innerHTML = taskLogs.map(function(l) {
    const actClass = 'la-' + (l.action || 'MODIFICATO');
    return '<div class="hist-row">' +
      '<div class="hist-row-head">' +
        '<span><span class="log-action-badge ' + actClass + '">' + escapeHtml(l.action || 'AZIONE') + '</span> <strong style="margin-left:4px;">' + escapeHtml(l.user || 'Utente') + '</strong> <small style="color:var(--muted);">(' + escapeHtml(l.userSec || l.sec || '-') + ')</small></span>' +
        '<span style="font-size:0.73rem; color:var(--muted);">' + escapeHtml(formatTimestamp(l.ts)) + '</span>' +
      '</div>' +
      (l.details ? ('<div style="color:var(--text-soft); font-size:0.77rem; margin-top:2px; word-break:break-word;">' + escapeHtml(l.details) + '</div>') : '') +
    '</div>';
  }).join('');
}

function openModal(id, templatePreset) {
  const t = id ? tasks.find(function(x) { return x.id === id; }) : null;
  const todayISO = toISODateLocal(new Date());
  const editable = t ? canEditTask(t) : true;
  const isAdmin = currentUser && currentUser.role === 'admin';
  const curSecFilter = getActiveSectionFilter();

  editingTaskLoadedUpdatedAt = t ? (t.updatedAt || null) : null;

  setModalTab('details');

  document.getElementById('modal-title').textContent = t
    ? 'Dettaglio Pratica'
    : (templatePreset ? ('Nuova Pratica — ' + templatePreset.label.replace(/^[^\wÀ-ÿ]+/, '')) : 'Nuova Pratica / Task');
  document.getElementById('modal-readonly-tag').classList.toggle('hidden', editable);
  document.getElementById('btn-save-task').classList.toggle('hidden', !editable);
  document.getElementById('btn-delete-in-modal').classList.toggle('hidden', !(t && editable));
  const dupBtn = document.getElementById('btn-duplicate-in-modal');
  if (dupBtn) dupBtn.classList.toggle('hidden', !t);

  document.getElementById('t-id').value = t ? t.id : '';
  document.getElementById('t-code').value = t ? (t.code || '') : '';
  document.getElementById('t-ato').value = t ? (t.ato || '') : '';
  document.getElementById('t-sec').value = t ? sanitizeSection(t.sec) : (isAdmin ? (curSecFilter || 'NATO') : sanitizeSection(currentUser.sec));
  document.getElementById('t-tipo').value = t ? (t.tipo || 'Appunto') : (templatePreset ? templatePreset.tipo : 'Appunto');
  document.getElementById('t-title').value = t ? t.title : '';
  document.getElementById('t-prio').value = t ? (t.prio || 'Ordinario') : (templatePreset ? templatePreset.prio : 'Ordinario');
  document.getElementById('t-class').value = t ? (t.classif || 'Non Classificato') : (templatePreset ? templatePreset.classif : 'Non Classificato');
  document.getElementById('t-dest').value = t ? normalizeApprover(t.dest) : (templatePreset ? templatePreset.dest : 'CR');
  document.getElementById('t-ins-date').value = t ? (t.insDate || todayISO) : todayISO;
  document.getElementById('t-pcn-out').value = t ? (t.pcnOut || '') : '';
  document.getElementById('t-pcn-in').value = t ? (t.pcnIn || '') : '';

  let initialDueDate = '';
  if (t) {
    initialDueDate = t.date || '';
  } else if (templatePreset && templatePreset.daysDue) {
    const d = new Date();
    d.setDate(d.getDate() + templatePreset.daysDue);
    initialDueDate = toISODateLocal(d);
  }
  document.getElementById('t-date').value = initialDueDate;
  document.getElementById('t-time').value = t ? (t.time || '12:00') : '12:00';
  document.getElementById('t-status').value = t ? (t.status || 'In lavorazione') : 'In lavorazione';
  document.getElementById('t-prot').value = t ? (t.prot || '') : '';
  document.getElementById('t-link').value = t ? (t.link || '') : '';
  document.getElementById('t-notes').value = t ? (t.notes || '') : '';
  document.getElementById('t-mid-done').checked = t ? Boolean(t.midDone) : false;

  // Popolamento Checklist
  if (t) {
    modalChecklist = Array.isArray(t.checklist)
      ? t.checklist.map(function(c) { return { text: String(c.text || ''), done: Boolean(c.done) }; })
      : [];
  } else if (templatePreset && Array.isArray(templatePreset.checklist)) {
    modalChecklist = templatePreset.checklist.map(function(txt) { return { text: String(txt || ''), done: false }; });
  } else {
    modalChecklist = [];
  }
  renderModalChecklist(editable);
  loadAndRenderTaskHistory(t);

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
    if (t.updatedBy) html += '<div>🕒 <b>Ultima modifica:</b> ' + escapeHtml(t.updatedBy) + ' — ' + escapeHtml(formatTimestamp(t.updatedAt)) + '</div>';
    if (t.createdBy) html += '<div style="color:var(--muted); font-size:0.73rem;">Creato da: ' + escapeHtml(t.createdBy) + ' il ' + escapeHtml(formatTimestamp(t.createdAt)) + '</div>';
    auditBox.innerHTML = html;
    auditBox.classList.remove('hidden');
  } else {
    auditBox.classList.add('hidden');
  }

  updateModalDuplicateWarning();
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  editingTaskLoadedUpdatedAt = null;
  document.getElementById('modal').classList.add('hidden');
}

function duplicateCurrentModalTask() {
  const id = document.getElementById('t-id').value;
  const orig = tasks.find(function(x) { return x.id === id; });
  if (!orig) return;

  const isAdmin = currentUser && currentUser.role === 'admin';
  const targetSec = isAdmin ? sanitizeSection(orig.sec) : sanitizeSection(currentUser ? currentUser.sec : 'NATO');

  editingTaskLoadedUpdatedAt = null;
  document.getElementById('t-id').value = '';
  document.getElementById('t-code').value = '';
  document.getElementById('modal-title').textContent = 'Nuova Pratica (Copia di ' + (orig.code || 'Pratica') + ')';
  document.getElementById('modal-readonly-tag').classList.add('hidden');
  document.getElementById('btn-save-task').classList.remove('hidden');
  document.getElementById('btn-delete-in-modal').classList.add('hidden');
  document.getElementById('btn-duplicate-in-modal').classList.add('hidden');
  document.getElementById('t-audit-box').classList.add('hidden');

  ['t-ato','t-sec','t-tipo','t-title','t-prio','t-class','t-dest','t-ins-date','t-pcn-out','t-pcn-in','t-date','t-time','t-status','t-prot','t-link','t-notes','t-mid-done'].forEach(function(fid) {
    document.getElementById(fid).disabled = (fid === 't-sec' && !isAdmin);
  });

  document.getElementById('t-sec').value = targetSec;
  document.getElementById('t-tipo').value = orig.tipo || 'Appunto';
  document.getElementById('t-prio').value = orig.prio || 'Ordinario';
  document.getElementById('t-class').value = orig.classif || 'Non Classificato';
  document.getElementById('t-dest').value = normalizeApprover(orig.dest);
  document.getElementById('t-notes').value = orig.notes || '';
  document.getElementById('t-link').value = orig.link || '';
  document.getElementById('t-title').value = (orig.title || '') + ' (Copia)';

  document.getElementById('t-ato').value = '';
  document.getElementById('t-prot').value = '';
  document.getElementById('t-pcn-out').value = '';
  document.getElementById('t-pcn-in').value = '';
  document.getElementById('t-date').value = '';
  document.getElementById('t-time').value = '12:00';
  document.getElementById('t-mid-done').checked = false;
  document.getElementById('t-ins-date').value = toISODateLocal(new Date());
  document.getElementById('t-status').value = 'Da iniziare';

  modalChecklist = Array.isArray(orig.checklist)
    ? orig.checklist.map(function(c) { return { text: String(c.text || ''), done: false }; })
    : [];

  renderModalChecklist(true);
  setModalTab('details');
  loadAndRenderTaskHistory(null);
  updateCodePreviewForNewTask();
  updateModalDuplicateWarning();
  showToast('📋 Pratica duplicata in bozza: verifica i campi e premi Salva');
}

function closeAllModals() {
  ['modal', 'modal-dups', 'modal-log', 'modal-admin', 'modal-briefing'].forEach(function(mid) {
    const el = document.getElementById(mid);
    if (el) el.classList.add('hidden');
  });
  editingTaskLoadedUpdatedAt = null;
}

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
  toastTimerId = setTimeout(function() { el.classList.remove('show'); }, 3400);
}

// Copia negli appunti affidabile anche su file:// (fallback execCommand)
async function copyTextReliable(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed; top:-9999px; left:-9999px; opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch (e) {
    return false;
  }
}

async function openOrCopyLink(rawLink) {
  const link = String(rawLink || '').trim();
  if (!link) {
    showToast('⚠️ Nessun link o percorso allegato');
    return;
  }

  // 1. Link Web (SharePoint, Intranet, HTTPS/HTTP): apertura diretta isolata
  if (/^https?:\/\//i.test(link)) {
    window.open(link, '_blank', 'noopener,noreferrer');
    showToast('🌐 Link aperto in una nuova scheda');
    return;
  }

  // Copia negli appunti il percorso originale (con fallback per file://)
  const copied = await copyTextReliable(link);
  const copySuffix = copied ? ' (percorso copiato)' : '';

  // 2. Normalizzazione del percorso e codifica URI sicura per spazi/caratteri speciali
  const cleanPath = link.replace(/^file:\/\/\/?/i, '').replace(/\//g, '\\');
  const encodedFileUrl = encodeURI('file:///' + cleanPath.replace(/\\/g, '/')).replace(/#/g, '%23');

  // 3. Documenti Microsoft Office: apertura diretta in app desktop
  if (/\.(docx?|docm)$/i.test(cleanPath)) {
    window.location.href = 'ms-word:ofe|u|' + encodedFileUrl;
    showToast('📝 Apertura in Microsoft Word...' + copySuffix);
    return;
  }
  if (/\.(xlsx?|xlsm|xlsb)$/i.test(cleanPath)) {
    window.location.href = 'ms-excel:ofe|u|' + encodedFileUrl;
    showToast('📊 Apertura in Microsoft Excel...' + copySuffix);
    return;
  }
  if (/\.(pptx?|pptm)$/i.test(cleanPath)) {
    window.location.href = 'ms-powerpoint:ofe|u|' + encodedFileUrl;
    showToast('📑 Apertura in Microsoft PowerPoint...' + copySuffix);
    return;
  }

  // 4. Cartelle o file generici Windows / LAN: copia affidabile o prompt selezionabile
  if (copied) {
    showToast('📋 Percorso copiato! Premi Win+R → Ctrl+V → Invio per aprirlo subito');
  } else {
    prompt('Copia manualmente questo percorso (Ctrl+C):', link);
  }
}

// Helper condiviso di verifica conflitto per salvataggi da modale, Kanban e Calendario
async function verifyNoExternalConflict(taskId, expectedUpdatedAt, reopenOnCancel) {
  if (!taskId || !expectedUpdatedAt) return true;
  const res = await checkTaskConflict(taskId, expectedUpdatedAt);
  if (!res.conflict) return true;

  if (res.deleted) {
    const overwriteDeleted = confirm(
      '⚠️ Attenzione: questa pratica è stata ELIMINATA nel frattempo da un altro utente.\n\n' +
      'Premi OK per salvarla di nuovo, oppure Annulla per ricaricare l\'archivio.'
    );
    if (!overwriteDeleted) {
      await syncAllFromStorage(false, true);
      if (reopenOnCancel) closeModal();
      return false;
    }
    return true;
  }

  const who = res.diskTask.updatedBy || 'un altro utente';
  const when = formatTimestamp(res.diskTask.updatedAt);
  const overwrite = confirm(
    '⚠️ Conflitto di modifica rilevato!\n\n' +
    'Questa pratica è stata modificata nel frattempo da ' + who + ' il ' + when + '.\n\n' +
    'Premi OK per SOVRASCRIVERE con le tue modifiche, oppure Annulla per ricaricare la versione aggiornata.'
  );
  if (!overwrite) {
    await syncAllFromStorage(false, true);
    if (reopenOnCancel) openModal(taskId);
    return false;
  }
  return true;
}

function computeCompletedAt(oldTask, newStatus, nowISO) {
  const isNowDone = String(newStatus || '').trim().toLowerCase().startsWith('completat');
  if (!isNowDone) return '';
  if (oldTask && oldTask.completedAt) return oldTask.completedAt;
  return nowISO;
}

async function saveTask() {
  const title = document.getElementById('t-title').value.trim();
  if (!title) { alert('Inserisci l\'Oggetto della pratica.'); return; }
  const sec = sanitizeSection(document.getElementById('t-sec').value);
  if (!canEditSection(sec)) { alert('Non hai i permessi per modificare la sezione ' + sec + '.'); return; }

  const existingId = document.getElementById('t-id').value;
  const oldTask = existingId ? tasks.find(function(x) { return x.id === existingId; }) : null;
  if (oldTask && !canEditTask(oldTask)) { alert('Accesso negato.'); return; }

  // 1. Controllo conflitti ottimistico su disco prima di salvare modifiche esistenti
  if (oldTask) {
    const proceed = await verifyNoExternalConflict(existingId, editingTaskLoadedUpdatedAt, true);
    if (!proceed) return;
  }

  const dups = updateModalDuplicateWarning();
  if (dups.length > 0 && !confirm('Possibile duplicato rilevato (' + (dups[0].task.code || '') + ' — ' + dups[0].reasons.join(', ') + ').\n\nVuoi salvare comunque?')) return;

  const nowISO = new Date().toISOString();
  const userLabel = currentUser.name + ' (' + currentUser.sec + ')';
  const insDate = document.getElementById('t-ins-date').value || toISODateLocal(new Date());
  const id = existingId || ('TSK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5));
  const code = (oldTask && oldTask.code) ? oldTask.code : await generateSafeAutoCode(sec, insDate.slice(0, 4));

  const cleanChecklist = modalChecklist
    .map(function(c) { return { text: String(c.text || '').trim(), done: Boolean(c.done) }; })
    .filter(function(c) { return c.text; });

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
    completedAt: computeCompletedAt(oldTask, document.getElementById('t-status').value, nowISO),
    checklist: cleanChecklist,
    createdBy: oldTask ? (oldTask.createdBy || userLabel) : userLabel,
    createdAt: oldTask ? (oldTask.createdAt || nowISO) : nowISO,
    updatedBy: userLabel, updatedAt: nowISO
  };

  const diffs = [];
  if (oldTask) {
    if (oldTask.status !== item.status) diffs.push('Stato: ' + oldTask.status + ' → ' + item.status);
    if (oldTask.date !== item.date || oldTask.time !== item.time) diffs.push('Scadenza: ' + (oldTask.date || '-') + ' → ' + (item.date || '-') + ' ' + item.time);
    if (oldTask.dest !== item.dest) diffs.push('Approv.: ' + oldTask.dest + ' → ' + item.dest);
    if (oldTask.sec !== item.sec) diffs.push('Sezione: ' + oldTask.sec + ' → ' + item.sec);
    if (oldTask.title !== item.title) diffs.push('Oggetto modificato');

    const oldChk = Array.isArray(oldTask.checklist) ? oldTask.checklist : [];
    const oldDone = oldChk.filter(function(x) { return Boolean(x && x.done); }).length;
    const newDone = cleanChecklist.filter(function(x) { return Boolean(x && x.done); }).length;
    if (oldChk.length !== cleanChecklist.length || oldDone !== newDone) {
      diffs.push('Checklist: ' + oldDone + '/' + oldChk.length + ' → ' + newDone + '/' + cleanChecklist.length);
    }
  }

  // Prepara lista aggiornata senza ancora mutare `tasks` finché la scrittura su disco non riesce
  const nextTasks = tasks.slice();
  if (oldTask) {
    const idx = nextTasks.findIndex(function(x) { return x.id === id; });
    if (idx >= 0) nextTasks[idx] = item;
    else nextTasks.push(item);
  } else {
    nextTasks.push(item);
  }

  isSavingTask = true;
  try {
    await saveSingleTask(item, nextTasks);
    if (!oldTask) {
      await ensureUniqueCodeOnDisk(item);
    }
    tasks = nextTasks;
    try {
      await appendAuditLog(oldTask ? 'MODIFICATO' : 'CREATO', item.sec, '[' + item.code + '] ' + item.title, oldTask ? (diffs.join(' | ') || 'Aggiornamento pratica') : ('Nuova pratica — ' + item.status));
    } catch (err) {
      console.warn('Errore scrittura log (non bloccante):', err);
    }
  } catch (err) {
    alert('Errore durante il salvataggio nell\'archivio: ' + err.message + '\n\nI dati inseriti nel modulo non sono stati persi: verifica la connessione alla cartella di rete e riprova.');
    return;
  } finally {
    isSavingTask = false;
  }

  if (hideCompleted && isClosedStatus(item.status)) hideCompleted = false;

  const filterNotes = [];
  if (getActiveSectionFilter() && getActiveSectionFilter() !== item.sec) {
    filterNotes.push('sezione');
    setActiveSectionFilter('');
  }
  if (activeYearFilter && !matchesYearFilter(item, activeYearFilter)) {
    filterNotes.push('anno');
    activeYearFilter = '';
  }
  if (filterNotes.length) showToast('Filtro ' + filterNotes.join(' e ') + ' azzerato per mostrare la pratica ' + (item.code || ''));
  else showToast('✓ Pratica ' + (item.code || '') + ' salvata');

  populateYearLists();
  closeModal();
  render();
}

async function deleteTaskById(id) {
  const t = tasks.find(function(x) { return x.id === id; });
  if (!t || !canEditTask(t)) { alert('Puoi eliminare solo le pratiche della tua sezione.'); return; }

  // 1. Controllo conflitti preventivo
  const proceed = await verifyNoExternalConflict(t.id, t.updatedAt, false);
  if (!proceed) return;

  if (!confirm('Spostare nel Cestino la pratica ' + (t.code || '') + '? (L\'Amministratore potrà ripristinarla)')) return;

  try {
    await softDeleteTaskById(id);
  } catch (err) {
    alert('Errore spostamento nel Cestino: ' + err.message);
    return;
  }

  showToast('Pratica ' + (t.code || '') + ' spostata nel Cestino');
  populateYearLists();
  closeModal();
  render();
}

async function applyBatchStatus() {
  const selectEl = document.getElementById('batch-status-select');
  const newStatus = selectEl ? selectEl.value : '';
  if (!newStatus) { alert('Seleziona uno stato da applicare.'); return; }

  const targets = tasks.filter(function(t) { return selectedTaskIds.has(t.id) && canEditTask(t); });
  if (!targets.length) { alert('Nessuna pratica modificabile selezionata.'); return; }

  if (!confirm('Aggiornare lo stato a "' + newStatus + '" per ' + targets.length + ' pratiche selezionate?')) return;

  isSavingTask = true;
  try {
    const nowISO = new Date().toISOString();
    const userLabel = currentUser ? (currentUser.name + ' (' + currentUser.sec + ')') : 'Utente';
    let nextTasks = tasks.slice();
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const oldStatus = t.status;
      const updated = Object.assign({}, t, {
        status: newStatus,
        completedAt: computeCompletedAt(t, newStatus, nowISO),
        updatedBy: userLabel,
        updatedAt: nowISO
      });
      nextTasks = nextTasks.map(function(x) { return x.id === t.id ? updated : x; });
      await saveSingleTask(updated, nextTasks);
      tasks = nextTasks;
      try {
        await appendAuditLog('MODIFICATO', updated.sec, '[' + (updated.code || '-') + '] ' + updated.title, 'Stato (Batch): ' + oldStatus + ' → ' + newStatus);
      } catch (e) {}
    }
  } finally {
    isSavingTask = false;
  }
  selectedTaskIds.clear();
  if (selectEl) selectEl.value = '';
  populateYearLists();
  render();
  showToast('✓ Stato aggiornato su ' + targets.length + ' pratiche');
}

async function applyBatchDate() {
  const dateInput = document.getElementById('batch-date-input');
  const newDate = dateInput ? dateInput.value : '';
  if (!newDate) { alert('Seleziona una data di scadenza.'); return; }

  const targets = tasks.filter(function(t) { return selectedTaskIds.has(t.id) && canEditTask(t); });
  if (!targets.length) { alert('Nessuna pratica modificabile selezionata.'); return; }

  if (!confirm('Spostare la scadenza al ' + formatD(newDate) + ' per ' + targets.length + ' pratiche selezionate?')) return;

  isSavingTask = true;
  try {
    const nowISO = new Date().toISOString();
    const userLabel = currentUser ? (currentUser.name + ' (' + currentUser.sec + ')') : 'Utente';
    let nextTasks = tasks.slice();
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const oldDate = t.date || '-';
      const updated = Object.assign({}, t, {
        date: newDate,
        updatedBy: userLabel,
        updatedAt: nowISO
      });
      nextTasks = nextTasks.map(function(x) { return x.id === t.id ? updated : x; });
      await saveSingleTask(updated, nextTasks);
      tasks = nextTasks;
      try {
        await appendAuditLog('SPOSTATO', updated.sec, '[' + (updated.code || '-') + '] ' + updated.title, 'Scadenza (Batch): ' + oldDate + ' → ' + newDate);
      } catch (e) {}
    }
  } finally {
    isSavingTask = false;
  }
  selectedTaskIds.clear();
  if (dateInput) dateInput.value = '';
  populateYearLists();
  render();
  showToast('✓ Scadenza aggiornata su ' + targets.length + ' pratiche');
}

async function applyBatchSoftDelete() {
  const targets = tasks.filter(function(t) { return selectedTaskIds.has(t.id) && canEditTask(t); });
  if (!targets.length) { alert('Nessuna pratica modificabile selezionata.'); return; }

  if (!confirm('Spostare nel Cestino ' + targets.length + ' pratiche selezionate? (L\'Amministratore potrà ripristinarle)')) return;

  isSavingTask = true;
  try {
    const nowISO = new Date().toISOString();
    const userLabel = currentUser ? (currentUser.name + ' (' + currentUser.sec + ')') : 'Utente';
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      t.deleted = true;
      t.deletedBy = userLabel;
      t.deletedAt = nowISO;
      tasks = tasks.filter(function(x) { return x.id !== t.id; });
      deletedTasks.unshift(t);
      await saveSingleTask(t, tasks.concat(deletedTasks));
      try {
        await appendAuditLog('ELIMINATO', t.sec, '[' + (t.code || '-') + '] ' + t.title, 'Spostata nel Cestino (Batch)');
      } catch (err) {
        console.warn('Errore log cestino batch:', err);
      }
    }
  } finally {
    isSavingTask = false;
  }
  selectedTaskIds.clear();
  populateYearLists();
  render();
  showToast('🗑️ ' + targets.length + ' pratiche spostate nel Cestino');
}

/* -------------------------------------------------------------------------
   LOG, ADMIN, CSV & MIGRAZIONE EXCEL
   ------------------------------------------------------------------------- */
async function openLogModal() {
  await syncAllFromStorage(true, false);
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
    return '<tr><td style="white-space:nowrap;">' + escapeHtml(formatTimestamp(l.ts)) + '</td><td><b>' + escapeHtml(l.user) + '</b> <small style="color:var(--muted)">(' + escapeHtml(l.userSec) + ')</small></td><td><span class="sec-badge sec-' + escapeHtml(l.sec) + '">' + escapeHtml(l.sec) + '</span></td><td><span class="log-action-badge la-' + escapeHtml(l.action) + '">' + escapeHtml(l.action) + '</span></td><td>' + escapeHtml(l.target) + '</td><td style="color:var(--text-soft);">' + escapeHtml(l.details) + '</td></tr>';
  }).join('') : '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">Nessuna voce di log.</td></tr>';
}

// Protezione da CSV Formula Injection in Microsoft Excel
function csvSafeCell(val) {
  let s = String(val === undefined || val === null ? '' : val);
  if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) {
    s = "'" + s;
  }
  return '"' + s.replace(/"/g, '""') + '"';
}

function downloadCSV(filename, content) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function exportTasksCSV() {
  const headers = ['code','ato','insDate','tipo','sec','prio','classif','title','prot','pcnOut','pcnIn','status','dest','date','time','link','midDone','notes','createdBy','createdAt','updatedBy','updatedAt'];
  const rows = [headers.join(';')];
  tasks.forEach(function(t) {
    rows.push(headers.map(function(h) { return csvSafeCell(t[h] ?? ''); }).join(';'));
  });
  downloadCSV('export_task_OI_' + toISODateLocal(new Date()) + '.csv', rows.join('\r\n'));
}

function exportLogCSV() {
  const rows = ['DataOra;Utente;SezioneUtente;SezionePratica;Azione;Pratica;Dettagli'];
  logs.forEach(function(l) {
    rows.push([formatTimestamp(l.ts), l.user, l.userSec, l.sec, l.action, l.target, l.details].map(csvSafeCell).join(';'));
  });
  downloadCSV('log_attivita_OI_' + toISODateLocal(new Date()) + '.csv', rows.join('\r\n'));
}

function syncAdminRoleAndSection() {
  const roleEl = document.getElementById('adm-role');
  const secEl = document.getElementById('adm-sec');
  if (!roleEl || !secEl) return;
  if (roleEl.value === 'admin') {
    secEl.value = 'TUTTE';
    secEl.disabled = true;
  } else {
    secEl.disabled = false;
    if (secEl.value === 'TUTTE') secEl.value = 'NATO';
  }
}

function openAdminModal() {
  if (!currentUser || currentUser.role !== 'admin') return;
  syncAdminRoleAndSection();
  renderAdminUsers();
  renderAdminTrash();
  document.getElementById('modal-admin').classList.remove('hidden');
}

function renderAdminUsers() {
  document.getElementById('admin-users-tbody').innerHTML = users.map(function(u) {
    const isSelf = currentUser && u.id === currentUser.id;
    const safeUid = escapeHtml(u.id);
    return '<tr><td><b>' + escapeHtml(u.name) + '</b>' + (isSelf ? ' <small style="color:var(--today-text);">(Tu)</small>' : '') + '</td><td><span class="sec-badge sec-' + escapeHtml(u.sec) + '">' + escapeHtml(u.sec) + '</span></td><td>' + (u.role === 'admin' ? '🛡️ Amministratore' : '👤 Utente (' + escapeHtml(u.sec) + ')') + '</td><td><code>' + escapeHtml(u.pin) + '</code></td><td style="white-space:nowrap;"><button type="button" class="std-btn" data-adm-action="reset-pin" data-uid="' + safeUid + '">🔑 PIN</button> ' + (!isSelf ? '<button type="button" class="std-btn btn-danger" data-adm-action="del-user" data-uid="' + safeUid + '">🗑</button>' : '') + '</td></tr>';
  }).join('');
}

async function addAdminUser() {
  const name = document.getElementById('adm-name').value.trim(), role = document.getElementById('adm-role').value;
  let sec = document.getElementById('adm-sec').value;
  const pin = document.getElementById('adm-pin').value.trim();
  if (!name || !pin) { alert('Inserisci Nome e PIN.'); return; }
  if (role === 'admin') sec = 'TUTTE';
  else if (sec === 'TUTTE') { alert('Seleziona una delle 4 sezioni (NATO, UE, ONU, FOI).'); return; }
  const nextUser = { id: 'USR-' + Date.now(), name: name, sec: sec, role: role, pin: pin };
  users.push(nextUser);
  try {
    await saveUsersToStorage();
    await appendAuditLog('ADMIN', 'ADMIN', 'Utente: ' + name, 'Creato utente (' + role + ' — ' + sec + ')');
  } catch (err) {
    users = users.filter(function(x) { return x.id !== nextUser.id; });
    alert('Errore salvataggio utenti: ' + err.message);
    return;
  }
  document.getElementById('adm-name').value = '';
  renderAdminUsers();
}

function parseExcelDate(val) {
  return normalizeDateInput(val);
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
        const ds = new DecompressionStream('deflate-raw');
        // Lettura avviata in parallelo alla scrittura per evitare deadlock su fogli grandi
        const outPromise = new Response(ds.readable).arrayBuffer();
        const w = ds.writable.getWriter();
        await w.write(compData);
        await w.close();
        entries[name] = dec.decode(await outPromise);
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
    Object.keys(entries).sort().forEach(function(k) {
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
        if (VALID_SECTIONS.includes(sec) && vals[6] && String(vals[6]).toUpperCase() !== 'OGGETTO') {
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
    isSavingTask = true;
    try {
      for (let i = 0; i < extracted.length; i++) {
        const r = extracted[i];
        if (!tasks.some(function(x) { return (r.ato && x.ato === r.ato && x.sec === r.sec) || (x.title.toLowerCase() === r.title.toLowerCase() && x.sec === r.sec); })) {
          const item = Object.assign({
            id: 'XL-' + Date.now() + '-' + i, code: computeNextCodeFromList(tasks, r.sec, r.insDate ? r.insDate.slice(0, 4) : String(new Date().getFullYear())),
            date: '', time: '12:00', notes: '', link: '', midDone: false, createdBy: uLabel, createdAt: nowISO, updatedBy: uLabel, updatedAt: nowISO
          }, r);
          const nextList = tasks.concat([item]);
          await saveSingleTask(item, nextList);
          tasks = nextList;
          added++;
        }
      }
      await appendAuditLog('ADMIN', 'ADMIN', 'Migrazione Excel', 'Importate ' + added + ' pratiche da ' + file.name);
    } finally {
      isSavingTask = false;
    }
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

function unguardCsvCell(val) {
  const s = String(val || '').trim();
  if (s.length >= 2 && s[0] === "'" && /^[=+\-@]/.test(s[1])) {
    return s.slice(1);
  }
  return s;
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
      return (idx !== undefined && row[idx] !== undefined) ? unguardCsvCell(row[idx]) : '';
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

        const sec = sanitizeSection(getVal(row, 'sec') || getVal(row, 'sezione') || 'NATO');
        const insDate = normalizeDateInput(getVal(row, 'insdate') || getVal(row, 'inserimento')) || toISODateLocal(new Date());
        let code = getVal(row, 'code') || getVal(row, 'codice');
        if (!code) {
          code = computeNextCodeFromList(tasks, sec, insDate ? insDate.slice(0, 4) : String(new Date().getFullYear()));
        }

        const midRaw = (getVal(row, 'middone') || '').toLowerCase();
        const midDoneParsed = (midRaw === 'true' || midRaw === '1' || midRaw === 'si' || midRaw === 'sì');
        const hasMidCol = colIndex['middone'] !== undefined;

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
          pcnOut: normalizeDateInput(getVal(row, 'pcnout') || getVal(row, 'pcn out')),
          pcnIn: normalizeDateInput(getVal(row, 'pcnin') || getVal(row, 'pcn in')),
          status: getVal(row, 'status') || getVal(row, 'stato') || 'In lavorazione',
          dest: normalizeApprover(getVal(row, 'dest') || getVal(row, 'approvatore')),
          date: normalizeDateInput(getVal(row, 'date') || getVal(row, 'scadenza')),
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
            midDone: hasMidCol ? midDoneParsed : Boolean(existing.midDone),
            link: rowData.link || existing.link || '',
            updatedBy: uLabel,
            updatedAt: nowISO
          });
          const nextList = tasks.slice();
          nextList[existingIndex] = updatedItem;
          await saveSingleTask(updatedItem, nextList);
          tasks = nextList;
          updatedCount++;
        } else {
          const newId = 'TSK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + i;
          const newItem = Object.assign({
            id: newId,
            midDone: midDoneParsed,
            createdBy: getVal(row, 'createdby') || getVal(row, 'updatedby') || uLabel,
            createdAt: getVal(row, 'createdat') || getVal(row, 'updatedat') || nowISO,
            updatedBy: uLabel,
            updatedAt: nowISO
          }, rowData);
          const nextList = tasks.concat([newItem]);
          await saveSingleTask(newItem, nextList);
          tasks = nextList;
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

/* -------------------------------------------------------------------------
   CESTINO PRATICHE (ADMIN) & BACKUP INTEGRALE JSON
   ------------------------------------------------------------------------- */
function renderAdminTrash() {
  const cntEl = document.getElementById('admin-trash-count');
  if (cntEl) cntEl.textContent = deletedTasks.length;

  const tbody = document.getElementById('admin-trash-tbody');
  if (!tbody) return;

  if (deletedTasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:18px; color:var(--muted); font-style:italic;">Nessuna pratica presente nel Cestino.</td></tr>';
    return;
  }

  const sorted = deletedTasks.slice().sort(function(a, b) {
    const da = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const db = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return db - da;
  });

  tbody.innerHTML = sorted.map(function(t) {
    const delAt = t.deletedAt ? formatTimestamp(t.deletedAt) : '-';
    const delBy = t.deletedBy || 'Utente';
    const secColor = SEC_COLORS[t.sec] || '#0284c7';

    return '<tr>' +
      '<td style="padding:6px 8px; font-weight:700;">' + escapeHtml(t.code || '-') + '</td>' +
      '<td style="padding:6px 8px;"><strong style="color:' + secColor + ';">' + escapeHtml(t.sec || '-') + '</strong></td>' +
      '<td style="padding:6px 8px; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + escapeHtml(t.title || '') + '">' + escapeHtml(t.title || '-') + '</td>' +
      '<td style="padding:6px 8px; font-size:0.75rem; color:var(--muted);">' + escapeHtml(delBy) + '<br>' + escapeHtml(delAt) + '</td>' +
      '<td style="padding:6px 8px; text-align:right; white-space:nowrap;">' +
      '<button type="button" class="std-btn btn-admin" style="padding:3px 7px; font-size:0.74rem; margin-right:4px;" data-trash-action="restore" data-id="' + escapeHtml(t.id) + '" title="Ripristina nel Kanban">♻️ Ripristina</button>' +
      '<button type="button" class="std-btn btn-danger" style="padding:3px 7px; font-size:0.74rem;" data-trash-action="purge" data-id="' + escapeHtml(t.id) + '" title="Elimina definitivamente da disco">✕ Elimina</button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

async function exportFullBackupJson() {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Operazione riservata all\'Amministratore.');
    return;
  }
  try {
    await syncAllFromStorage(true, false);
    const snapshot = {
      app: 'OI_TASK_TRACKER',
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser ? currentUser.name : 'Admin',
      tasks: tasks.concat(deletedTasks),
      users: users,
      logs: logs
    };

    const jsonStr = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const now = new Date();
    const pad = function(n) { return String(n).padStart(2, '0'); };
    const fname = 'backup_OI_' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + '.json';

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    try {
      await appendAuditLog('ADMIN', 'ADMIN', 'Backup Completo', 'Esportato snapshot JSON (' + snapshot.tasks.length + ' pratiche, ' + snapshot.users.length + ' utenti)');
    } catch (e) {}

    showToast('Backup completo salvato: ' + fname);
  } catch (err) {
    alert('Errore generazione backup: ' + err.message);
  }
}

async function handleRestoreBackupJson(e) {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Operazione riservata all\'Amministratore.');
    return;
  }
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || data.app !== 'OI_TASK_TRACKER' || !Array.isArray(data.tasks)) {
      alert('File non valido: non è un archivio di backup completo conforme a Task Tracker Uff. OI.');
      return;
    }

    const taskCount = data.tasks.length;
    const userCount = Array.isArray(data.users) ? data.users.length : 0;
    const logCount = Array.isArray(data.logs) ? data.logs.length : 0;
    const expDate = data.exportedAt ? formatTimestamp(data.exportedAt) : 'data sconosciuta';

    const msg = 'Ripristinare questo backup?\n\n' +
      '• Data backup: ' + expDate + '\n' +
      '• Pratiche da importare: ' + taskCount + '\n' +
      '• Utenti da importare: ' + userCount + '\n' +
      '• Registri di log: ' + logCount + '\n\n' +
      'ATTENZIONE: Le pratiche e gli utenti con lo stesso ID verranno aggiornati con i dati del file.';

    if (!confirm(msg)) return;

    isSavingTask = true;
    try {
      // 1. Ripristino utenti
      if (Array.isArray(data.users) && data.users.length > 0) {
        users = data.users;
        await saveUsersToStorage();
      }

      // 2. Ripristino pratiche (attive e cestino)
      for (let i = 0; i < data.tasks.length; i++) {
        const item = data.tasks[i];
        if (item && item.id) {
          item.sec = sanitizeSection(item.sec);
          item.dest = normalizeApprover(item.dest);
          await saveSingleTask(item);
        }
      }

      // 3. Ripristino registri di audit
      if (Array.isArray(data.logs) && data.logs.length > 0) {
        if (storageMode === 'fs' && logsDirHandle) {
          for (let j = 0; j < data.logs.length; j++) {
            const entry = data.logs[j];
            if (entry && entry.id) {
              try { await writeJsonFile(logsDirHandle, entry.id + '.json', entry); } catch (e) {}
            }
          }
        } else {
          logs = data.logs;
          try { localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(logs)); } catch (e) {}
        }
      }

      try {
        await appendAuditLog('ADMIN', 'ADMIN', 'Ripristino Backup', 'Ripristinato backup integrale del ' + expDate + ' (' + taskCount + ' pratiche)');
      } catch (e) {}
    } finally {
      isSavingTask = false;
    }

    await syncAllFromStorage(true, true);
    renderAdminUsers();
    renderAdminTrash();
    render();
    alert('Ripristino completato con successo!');
  } catch (err) {
    alert('Errore durante il ripristino del backup: ' + err.message);
  } finally {
    e.target.value = '';
  }
}

/* -------------------------------------------------------------------------
   PUNTO DI SITUAZIONE (CONTROLLER MODALE & AZIONI)
   ------------------------------------------------------------------------- */
function openBriefingModal() {
  const secEl = document.getElementById('briefing-sec');
  if (secEl) {
    secEl.value = activeSecFilter || '';
  }
  renderBriefingPreview();
  const modal = document.getElementById('modal-briefing');
  if (modal) modal.classList.remove('hidden');
}

function renderBriefingPreview() {
  const preview = document.getElementById('briefing-preview');
  if (!preview) return;
  const secVal = document.getElementById('briefing-sec') ? document.getElementById('briefing-sec').value : '';
  const incDone = document.getElementById('briefing-inc-done') ? document.getElementById('briefing-inc-done').checked : true;
  preview.innerHTML = buildBriefingHtml(secVal, incDone);
}

async function copyBriefingToClipboard() {
  const el = document.getElementById('briefing-preview');
  if (!el) return;

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([el.innerHTML], { type: 'text/html' });
      const textBlob = new Blob([el.innerText], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
    } else {
      throw new Error('ClipboardItem API non disponibile');
    }
  } catch (e) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
  }

  showToast('Punto di Situazione copiato! Incolla in Word o Outlook (Ctrl+V)');
}

function printBriefing() {
  document.body.classList.add('printing-briefing');
  window.print();
  const cleanup = function() {
    document.body.classList.remove('printing-briefing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 1200);
}

function initApp() {
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {}
  applyTheme(savedTheme);

  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('btn-theme-auth').addEventListener('click', toggleTheme);

  // Chiusura rapida modali con tasto ESC
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const anyOpen = ['modal', 'modal-dups', 'modal-log', 'modal-admin', 'modal-briefing'].some(function(id) {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
      });
      if (anyOpen) closeAllModals();
    }
  });

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

  // Filtro Sezioni in Topbar (mantiene sincronizzato activeSecFilter)
  const fSec = document.getElementById('f-sec');
  if (fSec) {
    fSec.addEventListener('change', function() {
      activeSecFilter = fSec.value;
      render();
    });
  }

  document.getElementById('btn-notif-crit').addEventListener('click', function() {
    onlyCriticalFilter = !onlyCriticalFilter;
    render();
  });
  const btnClearCrit = document.getElementById('btn-clear-crit');
  if (btnClearCrit) {
    btnClearCrit.addEventListener('click', function() {
      onlyCriticalFilter = false;
      render();
    });
  }

  document.getElementById('btn-new-task').addEventListener('click', function() { openModal(null); });

  // Dropdown Template Precompilati
  const popTplList = document.getElementById('popover-template-list');
  if (popTplList) {
    popTplList.innerHTML = TASK_TEMPLATES.map(function(tpl) {
      return '<div class="popover-item" data-tpl-id="' + escapeHtml(tpl.id) + '">' +
        '<span>' + escapeHtml(tpl.label) + '</span>' +
        '<span style="font-size:0.72rem; opacity:0.8;">(+' + tpl.daysDue + 'gg)</span>' +
      '</div>';
    }).join('');

    popTplList.addEventListener('click', function(e) {
      const item = e.target.closest('[data-tpl-id]');
      if (!item) return;
      const tplId = item.getAttribute('data-tpl-id');
      const tpl = TASK_TEMPLATES.find(function(x) { return x.id === tplId; });
      document.getElementById('popover-templates').classList.add('hidden');
      if (tpl) openModal(null, tpl);
    });
  }

  const btnNewFromTpl = document.getElementById('btn-new-from-tpl');
  if (btnNewFromTpl) {
    btnNewFromTpl.addEventListener('click', function(e) {
      e.stopPropagation();
      const pop = document.getElementById('popover-templates');
      if (pop) pop.classList.toggle('hidden');
    });
  }

  // Chiusura al click esterno per popover template
  document.addEventListener('click', function(e) {
    const popTpl = document.getElementById('popover-templates');
    if (popTpl && !popTpl.classList.contains('hidden')) {
      if (!e.target.closest('#tpl-dropdown-wrap')) {
        popTpl.classList.add('hidden');
      }
    }
  });
  document.getElementById('btn-sync-now').addEventListener('click', function() { syncAllFromStorage(false, true); });

  // Filtri Rapidi 1-clic (Mia Sez., Attesa PCN, Verifica -7gg)
  const btnQfMySec = document.getElementById('btn-qf-mysec');
  if (btnQfMySec) {
    btnQfMySec.addEventListener('click', function() {
      if (!currentUser || !VALID_SECTIONS.includes(currentUser.sec)) return;
      const cur = getActiveSectionFilter();
      setActiveSectionFilter(cur === currentUser.sec ? '' : currentUser.sec);
      render();
    });
  }
  const btnQfPcn = document.getElementById('btn-qf-pcn');
  if (btnQfPcn) {
    btnQfPcn.addEventListener('click', function() {
      quickFilterPcn = !quickFilterPcn;
      render();
    });
  }
  const btnQfMid = document.getElementById('btn-qf-mid');
  if (btnQfMid) {
    btnQfMid.addEventListener('click', function() {
      quickFilterMid = !quickFilterMid;
      render();
    });
  }

  // Punto di Situazione (Word / Outlook / Stampa)
  const btnOpenBriefing = document.getElementById('btn-open-briefing');
  if (btnOpenBriefing) btnOpenBriefing.addEventListener('click', openBriefingModal);
  const btnOpenBriefingStats = document.getElementById('btn-open-briefing-stats');
  if (btnOpenBriefingStats) btnOpenBriefingStats.addEventListener('click', openBriefingModal);
  const btnCloseBriefing = document.getElementById('btn-close-briefing');
  if (btnCloseBriefing) btnCloseBriefing.addEventListener('click', function() {
    document.getElementById('modal-briefing').classList.add('hidden');
  });
  const btnCopyBriefing = document.getElementById('btn-copy-briefing');
  if (btnCopyBriefing) btnCopyBriefing.addEventListener('click', copyBriefingToClipboard);
  const btnPrintBriefing = document.getElementById('btn-print-briefing');
  if (btnPrintBriefing) btnPrintBriefing.addEventListener('click', printBriefing);
  const briefingSecEl = document.getElementById('briefing-sec');
  if (briefingSecEl) briefingSecEl.addEventListener('change', renderBriefingPreview);
  const briefingIncDoneEl = document.getElementById('briefing-inc-done');
  if (briefingIncDoneEl) briefingIncDoneEl.addEventListener('change', renderBriefingPreview);

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
  document.getElementById('adm-role').addEventListener('change', syncAdminRoleAndSection);
  document.getElementById('btn-adm-add-user').addEventListener('click', addAdminUser);
  document.getElementById('btn-admin-import-csv').addEventListener('click', function() { document.getElementById('csv-file').click(); });
  document.getElementById('csv-file').addEventListener('change', handleAdminCsvImport);
  document.getElementById('btn-admin-import-excel').addEventListener('click', function() { document.getElementById('excel-file').click(); });
  document.getElementById('excel-file').addEventListener('change', handleAdminExcelMigration);
  document.getElementById('btn-export-csv').addEventListener('click', exportTasksCSV);

  // Backup Completo & Ripristino Integrale JSON
  const btnBackupJson = document.getElementById('btn-admin-backup-json');
  if (btnBackupJson) btnBackupJson.addEventListener('click', exportFullBackupJson);
  const btnRestoreJson = document.getElementById('btn-admin-restore-json');
  if (btnRestoreJson) btnRestoreJson.addEventListener('click', function() {
    document.getElementById('backup-json-file').click();
  });
  const fileRestoreJson = document.getElementById('backup-json-file');
  if (fileRestoreJson) fileRestoreJson.addEventListener('change', handleRestoreBackupJson);

  // Cestino Pratiche Eliminate (Admin): Ripristina / Elimina definitivamente / Svuota > 30gg
  const trashTbody = document.getElementById('admin-trash-tbody');
  if (trashTbody) {
    trashTbody.addEventListener('click', async function(e) {
      const btn = e.target.closest('[data-trash-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-trash-action');
      const id = btn.getAttribute('data-id');
      const t = deletedTasks.find(function(x) { return x.id === id; });
      if (!t) return;

      if (act === 'restore') {
        try {
          await restoreTaskFromTrash(id);
          populateYearLists();
          renderAdminTrash();
          render();
          showToast('Pratica ' + (t.code || '') + ' ripristinata dal Cestino');
        } catch (err) {
          alert('Errore ripristino pratica: ' + err.message);
        }
      } else if (act === 'purge') {
        if (!confirm('ATTENZIONE: Eliminare DEFINITIVAMENTE la pratica ' + (t.code || '') + '?\n\nQuesta operazione cancella il file da disco e NON può essere annullata.')) return;
        try {
          await purgeTaskPermanently(id);
          renderAdminTrash();
          showToast('Pratica ' + (t.code || '') + ' eliminata definitivamente');
        } catch (err) {
          alert('Errore eliminazione definitiva: ' + err.message);
        }
      }
    });
  }

  const btnPurgeOld = document.getElementById('btn-purge-old-trash');
  if (btnPurgeOld) {
    btnPurgeOld.addEventListener('click', async function() {
      const cutoff = Date.now() - (30 * 86400000);
      const count = deletedTasks.filter(function(t) {
        if (!t.deletedAt) return false;
        const dt = new Date(t.deletedAt).getTime();
        return !isNaN(dt) && dt < cutoff;
      }).length;

      if (count === 0) {
        alert('Nessuna pratica nel Cestino è più vecchia di 30 giorni.');
        return;
      }

      if (!confirm('ATTENZIONE: Eliminare definitivamente ' + count + ' pratiche presenti nel Cestino da oltre 30 giorni?\n\nI rispettivi file verranno cancellati dal disco.')) return;

      try {
        const purged = await purgeExpiredTrash(30);
        renderAdminTrash();
        showToast('Eliminate definitivamente ' + purged + ' pratiche scadute');
      } catch (err) {
        alert('Errore pulizia pratiche: ' + err.message);
      }
    });
  }

  document.getElementById('admin-users-tbody').addEventListener('click', async function(e) {
    const btn = e.target.closest('[data-adm-action]'); if (!btn) return;
    const act = btn.getAttribute('data-adm-action'), uid = btn.getAttribute('data-uid');
    const u = users.find(function(x) { return x.id === uid; }); if (!u) return;
    if (act === 'reset-pin') {
      const p = prompt('Nuovo PIN per ' + u.name + ':', u.pin);
      if (p && p.trim()) {
        const oldPin = u.pin;
        u.pin = p.trim();
        try {
          await saveUsersToStorage();
          await appendAuditLog('ADMIN', 'ADMIN', 'Utente: ' + u.name, 'PIN aggiornato');
          renderAdminUsers();
        } catch (err) {
          u.pin = oldPin;
          alert('Errore salvataggio PIN: ' + err.message);
        }
      }
    } else if (act === 'del-user') {
      if (confirm('Eliminare utente ' + u.name + '?')) {
        const prevUsers = users.slice();
        users = users.filter(function(x) { return x.id !== uid; });
        try {
          await saveUsersToStorage();
          await appendAuditLog('ADMIN', 'ADMIN', 'Utente: ' + u.name, 'Utente rimosso');
          renderAdminUsers();
        } catch (err) {
          users = prevUsers;
          alert('Errore rimozione utente: ' + err.message);
        }
      }
    }
  });

  // Tab e Checklist nella Modale Task
  const modalTaskTabs = document.getElementById('modal-task-tabs');
  if (modalTaskTabs) {
    modalTaskTabs.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-mtab]');
      if (!btn) return;
      setModalTab(btn.getAttribute('data-mtab'));
    });
  }

  const btnChkAdd = document.getElementById('btn-chk-add');
  if (btnChkAdd) btnChkAdd.addEventListener('click', addChecklistItemFromInput);

  const inputChkNew = document.getElementById('t-chk-new-input');
  if (inputChkNew) {
    inputChkNew.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addChecklistItemFromInput();
      }
    });
  }

  const chkListEl = document.getElementById('t-chk-list');
  if (chkListEl) {
    chkListEl.addEventListener('change', function(e) {
      const chk = e.target.closest('[data-chk-toggle]');
      if (!chk) return;
      const idx = parseInt(chk.getAttribute('data-chk-toggle'), 10);
      if (!isNaN(idx) && modalChecklist[idx]) {
        modalChecklist[idx].done = chk.checked;
        renderModalChecklist(true);
      }
    });

    chkListEl.addEventListener('click', function(e) {
      const delBtn = e.target.closest('[data-chk-del]');
      if (!delBtn) return;
      const idx = parseInt(delBtn.getAttribute('data-chk-del'), 10);
      if (!isNaN(idx) && modalChecklist[idx]) {
        modalChecklist.splice(idx, 1);
        renderModalChecklist(true);
      }
    });
  }

  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('btn-save-task').addEventListener('click', saveTask);
  document.getElementById('btn-delete-in-modal').addEventListener('click', function() {
    const id = document.getElementById('t-id').value;
    if (id) deleteTaskById(id);
  });
  const btnDupInModal = document.getElementById('btn-duplicate-in-modal');
  if (btnDupInModal) btnDupInModal.addEventListener('click', duplicateCurrentModalTask);

  const tblSelectAll = document.getElementById('tbl-select-all');
  if (tblSelectAll) {
    tblSelectAll.addEventListener('change', function() {
      const filtered = getFilteredTasks();
      const editableIds = filtered.filter(canEditTask).map(function(t) { return t.id; });
      if (this.checked) {
        editableIds.forEach(function(id) { selectedTaskIds.add(id); });
      } else {
        editableIds.forEach(function(id) { selectedTaskIds.delete(id); });
      }
      renderTable(filtered);
    });
  }

  const tblBody = document.getElementById('table-body');
  if (tblBody) {
    tblBody.addEventListener('change', function(e) {
      const chk = e.target.closest('.tbl-row-chk');
      if (!chk) return;
      const id = chk.getAttribute('data-chk-id');
      if (!id) return;
      if (chk.checked) selectedTaskIds.add(id);
      else selectedTaskIds.delete(id);
      updateBatchBarUI(getFilteredTasks());
    });
  }

  const btnBatchStatus = document.getElementById('btn-batch-apply-status');
  if (btnBatchStatus) btnBatchStatus.addEventListener('click', applyBatchStatus);

  const btnBatchDate = document.getElementById('btn-batch-apply-date');
  if (btnBatchDate) btnBatchDate.addEventListener('click', applyBatchDate);

  const btnBatchDelete = document.getElementById('btn-batch-delete');
  if (btnBatchDelete) btnBatchDelete.addEventListener('click', applyBatchSoftDelete);

  const btnBatchClear = document.getElementById('btn-batch-clear');
  if (btnBatchClear) {
    btnBatchClear.addEventListener('click', function() {
      selectedTaskIds.clear();
      renderTable(getFilteredTasks());
    });
  }

  document.getElementById('btn-prev-period').addEventListener('click', function() { if (calMode === 'week') calDate.setDate(calDate.getDate() - 7); else calDate = addMonthsSafe(calDate.getFullYear(), calDate.getMonth(), 1, -1); render(); });
  document.getElementById('btn-next-period').addEventListener('click', function() { if (calMode === 'week') calDate.setDate(calDate.getDate() + 7); else calDate = addMonthsSafe(calDate.getFullYear(), calDate.getMonth(), 1, 1); render(); });
  document.getElementById('btn-cal-today').addEventListener('click', function() { calDate = new Date(); render(); });
  document.getElementById('btn-cal-month').addEventListener('click', function() { calMode = 'month'; document.getElementById('btn-cal-month').classList.add('btn-active'); document.getElementById('btn-cal-week').classList.remove('btn-active'); render(); });
  document.getElementById('btn-cal-week').addEventListener('click', function() { calMode = 'week'; document.getElementById('btn-cal-week').classList.add('btn-active'); document.getElementById('btn-cal-month').classList.remove('btn-active'); render(); });

  // Debounce 150ms sulla ricerca testuale
  let searchDebounceTimer = null;
  document.getElementById('f-search').addEventListener('input', function() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(render, 150);
  });
  document.getElementById('f-tipo').addEventListener('change', render);
  document.getElementById('f-dest').addEventListener('change', render);
  document.getElementById('f-status').addEventListener('change', function() { if (isClosedStatus(this.value)) hideCompleted = false; render(); });
  document.getElementById('f-sort').addEventListener('change', function() { sortDirection = 'asc'; render(); });
  document.getElementById('btn-toggle-completed').addEventListener('click', function() {
    hideCompleted = !hideCompleted;
    if (hideCompleted && isClosedStatus(document.getElementById('f-status').value)) document.getElementById('f-status').value = '';
    render();
  });

  // Ordinamento tabella bidirezionale (clic ripetuto inverte ASC/DESC)
  document.querySelectorAll('th.sortable').forEach(function(th) {
    th.addEventListener('click', function() {
      const sortEl = document.getElementById('f-sort');
      const clickedSort = th.getAttribute('data-sort');
      if (sortEl.value === clickedSort) {
        sortDirection = (sortDirection === 'asc') ? 'desc' : 'asc';
      } else {
        sortEl.value = clickedSort;
        sortDirection = 'asc';
      }
      render();
    });
  });

  // Gruppi di stati per evitare declassamenti accidentali nella stessa colonna Kanban
  const KANBAN_STATUS_GROUPS = {
    'Da iniziare': ['Da iniziare'],
    'In lavorazione': ['In lavorazione'],
    'In verifica intermedia': ['In verifica intermedia', 'Pronto per consegna'],
    'Completato': ['Completato', 'Annullato']
  };

  // Drag & Drop su Kanban (Per Stato e, per Admin, Per Sezione)
  const boardEl = document.getElementById('view-board');
  boardEl.addEventListener('dragstart', function(e) {
    const card = e.target.closest('.k-card[data-task-id]');
    if (!card || card.getAttribute('draggable') !== 'true') return;
    draggedTaskId = card.getAttribute('data-task-id');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', draggedTaskId); } catch (err) {}
  });
  boardEl.addEventListener('dragover', function(e) {
    if (!draggedTaskId) return;
    const col = e.target.closest('.k-col[data-k-drop-status]') ||
                ((currentUser && currentUser.role === 'admin') ? e.target.closest('.k-col[data-k-drop-sec]') : null);
    if (!col) return;
    e.preventDefault();
    boardEl.querySelectorAll('.k-col.drag-over').forEach(function(x) { if (x !== col) x.classList.remove('drag-over'); });
    col.classList.add('drag-over');
  });
  boardEl.addEventListener('dragleave', function(e) {
    const col = e.target.closest('.k-col[data-k-drop-status], .k-col[data-k-drop-sec]');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });
  boardEl.addEventListener('drop', async function(e) {
    const col = e.target.closest('.k-col[data-k-drop-status], .k-col[data-k-drop-sec]');
    boardEl.querySelectorAll('.k-col.drag-over').forEach(function(x) { x.classList.remove('drag-over'); });
    if (!col) return;
    e.preventDefault();
    const id = draggedTaskId; draggedTaskId = null;
    const t = tasks.find(function(x) { return x.id === id; });
    if (!t || !canEditTask(t)) return;

    const newStatus = col.getAttribute('data-k-drop-status');
    const newSec = col.getAttribute('data-k-drop-sec');

    // Drop in modalità "Per Stato"
    if (newStatus) {
      const group = KANBAN_STATUS_GROUPS[newStatus] || [newStatus];
      // Non modificare se la pratica appartiene già alla colonna di destinazione
      if (group.includes(t.status)) return;

      const proceed = await verifyNoExternalConflict(t.id, t.updatedAt, false);
      if (!proceed) return;

      const oldStatus = t.status;
      const nowISO = new Date().toISOString();
      const updated = Object.assign({}, t, {
        status: newStatus,
        completedAt: computeCompletedAt(t, newStatus, nowISO),
        updatedBy: currentUser.name + ' (' + currentUser.sec + ')',
        updatedAt: nowISO
      });
      const nextTasks = tasks.map(function(x) { return x.id === id ? updated : x; });
      isSavingTask = true;
      try {
        await saveSingleTask(updated, nextTasks);
        tasks = nextTasks;
        try {
          await appendAuditLog('MODIFICATO', updated.sec, '[' + (updated.code || '-') + '] ' + updated.title, 'Kanban Stato: ' + oldStatus + ' → ' + newStatus);
        } catch (err) {
          console.warn('Errore scrittura log (non bloccante):', err);
        }
      } catch (err) {
        alert('Errore aggiornamento stato su archivio di rete: ' + err.message);
        return;
      } finally {
        isSavingTask = false;
      }
      if (hideCompleted && isClosedStatus(newStatus)) {
        showToast('✓ Pratica ' + (updated.code || '') + ' spostata in Completati (nascosta dal filtro Completati)');
      }
      render();
      return;
    }

    // Drop in modalità "Per Sezione" (solo Admin)
    if (newSec && currentUser && currentUser.role === 'admin') {
      const safeSec = sanitizeSection(newSec);
      if (t.sec === safeSec) return;
      if (!confirm('Spostare la pratica ' + (t.code || '') + ' dalla sezione ' + t.sec + ' alla sezione ' + safeSec + '?')) return;

      const proceed = await verifyNoExternalConflict(t.id, t.updatedAt, false);
      if (!proceed) return;

      const oldSec = t.sec;
      const updated = Object.assign({}, t, {
        sec: safeSec,
        updatedBy: currentUser.name + ' (' + currentUser.sec + ')',
        updatedAt: new Date().toISOString()
      });
      const nextTasks = tasks.map(function(x) { return x.id === id ? updated : x; });
      isSavingTask = true;
      try {
        await saveSingleTask(updated, nextTasks);
        tasks = nextTasks;
        try {
          await appendAuditLog('SPOSTATO', safeSec, '[' + (updated.code || '-') + '] ' + updated.title, 'Sezione: ' + oldSec + ' → ' + safeSec);
        } catch (err) {}
      } catch (err) {
        alert('Errore cambio sezione su archivio di rete: ' + err.message);
        return;
      } finally {
        isSavingTask = false;
      }
      showToast('✓ Pratica ' + (updated.code || '') + ' spostata in ' + safeSec);
      render();
    }
  });

  // Drag & Drop su Calendario con supporto navigazione sicura tra periodi/mesi
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
            calDate = addMonthsSafe(calDate.getFullYear(), calDate.getMonth(), 1, direction);
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

      const proceed = await verifyNoExternalConflict(t.id, t.updatedAt, false);
      if (!proceed) return;

      const curParts = (t.date || t.pcnIn || toISODateLocal(new Date())).split('-');
      const baseY = parseInt(curParts[0], 10);
      const baseM = parseInt(curParts[1], 10) - 1;
      const baseD = parseInt(curParts[2], 10) || 1;
      let dObj;
      if (calMode === 'week') {
        dObj = new Date(baseY, baseM, baseD + (direction * 7));
      } else {
        dObj = addMonthsSafe(baseY, baseM, baseD, direction);
      }
      const oldStr = (t.date || '-') + ' ' + (t.time || '12:00');
      const newDateStr = toISODateLocal(dObj);
      const updated = Object.assign({}, t, {
        date: newDateStr,
        updatedBy: currentUser.name + ' (' + currentUser.sec + ')',
        updatedAt: new Date().toISOString()
      });
      const nextTasks = tasks.map(function(x) { return x.id === id ? updated : x; });
      isSavingTask = true;
      try {
        await saveSingleTask(updated, nextTasks);
        tasks = nextTasks;
        try {
          await appendAuditLog('SPOSTATO', updated.sec, '[' + (updated.code || '-') + '] ' + updated.title, 'Calendario nav: ' + oldStr + ' → ' + updated.date + ' ' + (updated.time || '12:00'));
        } catch (err) {}
      } catch (err) {
        alert('Errore spostamento pratica su archivio di rete: ' + err.message);
        return;
      } finally {
        isSavingTask = false;
      }
      calDate = new Date(dObj.getFullYear(), dObj.getMonth(), (calMode === 'week' ? dObj.getDate() : 1));
      if (activeYearFilter && !matchesYearFilter(updated, activeYearFilter)) {
        activeYearFilter = '';
      }
      populateYearLists();
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

    const proceed = await verifyNoExternalConflict(t.id, t.updatedAt, false);
    if (!proceed) return;

    const oldStr = (t.date || '-') + ' ' + (t.time || '12:00');
    const newTime = targetTime || t.time || '12:00';
    const updated = Object.assign({}, t, {
      date: targetDate,
      time: newTime,
      updatedBy: currentUser.name + ' (' + currentUser.sec + ')',
      updatedAt: new Date().toISOString()
    });
    const nextTasks = tasks.map(function(x) { return x.id === id ? updated : x; });

    isSavingTask = true;
    try {
      await saveSingleTask(updated, nextTasks);
      tasks = nextTasks;
      try {
        await appendAuditLog('SPOSTATO', updated.sec, '[' + (updated.code || '-') + '] ' + updated.title, 'Calendario: ' + oldStr + ' → ' + updated.date + ' ' + updated.time);
      } catch (err) {
        console.warn('Errore scrittura log (non bloccante):', err);
      }
    } catch (err) {
      alert('Errore salvataggio data calendario su archivio di rete: ' + err.message);
      return;
    } finally {
      isSavingTask = false;
    }

    // Auto-navigazione se il giorno rilasciato appartiene a un altro mese
    const dp = targetDate.split('-');
    if (dp.length === 3) {
      const dropY = parseInt(dp[0], 10), dropM = parseInt(dp[1], 10) - 1;
      if (calDate.getFullYear() !== dropY || calDate.getMonth() !== dropM) {
        calDate = new Date(dropY, dropM, 1);
      }
      if (activeYearFilter && !matchesYearFilter(updated, activeYearFilter)) {
        activeYearFilter = '';
      }
    }
    populateYearLists();
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
      const proceed = await verifyNoExternalConflict(t.id, t.updatedAt, false);
      if (!proceed) return;
      const updated = Object.assign({}, t, {
        midDone: true,
        updatedBy: currentUser.name + ' (' + currentUser.sec + ')',
        updatedAt: new Date().toISOString()
      });
      const nextTasks = tasks.map(function(x) { return x.id === id ? updated : x; });
      isSavingTask = true;
      try {
        await saveSingleTask(updated, nextTasks);
        tasks = nextTasks;
        try {
          await appendAuditLog('VERIFICA', updated.sec, '[' + (updated.code || '-') + '] ' + updated.title, 'Verifica intermedia (-7gg) effettuata');
        } catch (err) {
          console.warn('Errore scrittura log (non bloccante):', err);
        }
      } catch (err) {
        alert('Errore aggiornamento verifica intermedia: ' + err.message);
        return;
      } finally {
        isSavingTask = false;
      }
      showToast('✓ Verifica intermedia confermata per ' + (updated.code || ''));
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
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
