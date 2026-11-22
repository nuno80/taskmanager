/* =========================================================
   views.js — Kanban (Stato/Sezione), Tabella, Calendario
   a 30 minuti e Statistiche con grafici.
   ========================================================= */

const APPROVERS_LIST = ['CS', 'CU/VCU', 'VCR', 'CR', 'SCa.SMD', 'Ca.SMD', 'UG', 'Altro'];
const TIME_SLOTS = [
  '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00',
  '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
];

// Stato dell'interfaccia
let currentView = 'board';
let kanbanGroup = 'status'; // 'status' | 'sec'
let activeSecFilter = '';   // sincronizzato con #f-sec
let activeYearFilter = '';  // dal popover anni
let onlyCriticalFilter = false; // dalla campanella
let quickFilterPcn = false;     // filtro rapido 1-clic attesa PCN
let quickFilterMid = false;     // filtro rapido 1-clic verifica intermedia (-7gg)
let calDate = new Date();
let calMode = 'month';
let hideCompleted = true;
let sortDirection = 'asc';  // 'asc' | 'desc'
let selectedTaskIds = new Set();

function getActiveSectionFilter() {
  const secEl = document.getElementById('f-sec');
  if (secEl) activeSecFilter = secEl.value;
  return activeSecFilter;
}

function setActiveSectionFilter(val) {
  activeSecFilter = val || '';
  const secEl = document.getElementById('f-sec');
  if (secEl) secEl.value = activeSecFilter;
}

/* -------------------------------------------------------------------------
   ANNI, FESTIVI & VALUTAZIONE SCADENZE
   ------------------------------------------------------------------------- */
function populateYearLists() {
  const yearSet = new Set([String(new Date().getFullYear())]);
  tasks.forEach(function(t) {
    yearSet.add(getTaskYear(t));
    if (t.date && /^\d{4}/.test(t.date)) yearSet.add(t.date.slice(0, 4));
  });
  const years = Array.from(yearSet).sort(function(a, b) { return b.localeCompare(a); });

  // Popover year list
  const popList = document.getElementById('popover-year-list');
  if (popList) {
    popList.innerHTML =
      '<div class="popover-item' + (activeYearFilter === '' ? ' active' : '') + '" data-yr=""><span>📁 Tutti gli Anni</span> <span style="font-size:0.72rem; opacity:0.8;">(' + tasks.length + ')</span></div>' +
      years.map(function(y) {
        const cnt = tasks.filter(function(t) { return matchesYearFilter(t, y); }).length;
        return '<div class="popover-item' + (activeYearFilter === y ? ' active' : '') + '" data-yr="' + escapeHtml(y) + '"><span>📁 Anno ' + escapeHtml(y) + '</span> <span style="font-size:0.72rem; opacity:0.8;">(' + cnt + ')</span></div>';
      }).join('');
  }
  const badge = document.getElementById('rail-year-badge');
  if (badge) {
    if (activeYearFilter) {
      badge.textContent = activeYearFilter;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  const yLabel = document.getElementById('rail-year-label');
  if (yLabel) {
    yLabel.textContent = activeYearFilter ? ('Anno ' + activeYearFilter) : 'Archivio Anno';
  }
  const yBtn = document.getElementById('rail-btn-year');
  if (yBtn) {
    yBtn.title = activeYearFilter ? ('Filtro attivo: Anno ' + activeYearFilter) : 'Archivio per Anno';
  }

  // Stats year dropdown
  const sYear = document.getElementById('stats-year');
  if (sYear) {
    const prevS = sYear.value;
    sYear.innerHTML = years.map(function(y) { return '<option value="' + escapeHtml(y) + '">Anno ' + escapeHtml(y) + '</option>'; }).join('') + '<option value="">Tutti gli Anni</option>';
    if (prevS === '' || years.includes(prevS)) sYear.value = prevS || years[0];
    else sYear.value = years[0];
  }
}

function getItalianHolidayName(dateObj) {
  const y = dateObj.getFullYear(), m = dateObj.getMonth() + 1, d = dateObj.getDate();
  const mmdd = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const fixed = {
    '01-01': 'Capodanno', '01-06': 'Epifania', '04-25': 'Liberazione',
    '05-01': 'Festa Lavoro', '06-02': 'Repubblica', '08-15': 'Ferragosto',
    '11-01': 'Ognissanti', '12-08': 'Immacolata', '12-25': 'Natale', '12-26': 'S. Stefano'
  };
  if (fixed[mmdd]) return fixed[mmdd];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d1 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d1 - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m1 = Math.floor((a + 11 * h + 22 * l) / 451);
  const eM = Math.floor((h + l - 7 * m1 + 114) / 31), eD = ((h + l - 7 * m1 + 114) % 31) + 1;
  const curStr = toISODateLocal(dateObj);
  if (curStr === toISODateLocal(new Date(y, eM - 1, eD))) return 'Pasqua';
  if (curStr === toISODateLocal(new Date(y, eM - 1, eD + 1))) return 'Pasquetta';
  if (dateObj.getDay() === 0) return 'Domenica';
  return null;
}

function evaluateTask(t) {
  const sLower = String(t.status || '').trim().toLowerCase();
  if (sLower.startsWith('completat')) return { badge: '<span class="badge b-done">✓ Completato</span>', shortText: '✓ Completato', cardClass: 'c-gray', code: 'DONE' };
  if (sLower.startsWith('annullat'))  return { badge: '<span class="badge b-canc">✕ Annullato</span>', shortText: '✕ Annullato', cardClass: 'c-gray', code: 'CANC' };
  if (!t.date) return { badge: '<span class="badge b-nosched">Da calendarizzare</span>', shortText: 'Senza scadenza', cardClass: 'c-mint', code: 'NOSCHED' };

  const now = new Date();
  const due = new Date(t.date + 'T' + (t.time || '12:00'));
  if (isNaN(due.getTime())) return { badge: '<span class="badge b-nosched">Data non valida</span>', shortText: String(t.date), cardClass: 'c-mint', code: 'NOSCHED' };
  const ins = t.insDate ? new Date(t.insDate + 'T09:00') : new Date(t.createdAt || now);
  const diffHours = (due - now) / 3600000;
  const totalDays = isNaN(ins.getTime()) ? 0 : (due - ins) / (3600000 * 24);
  const hasMidCheck = totalDays >= 7;
  const midDate = hasMidCheck ? new Date(due.getTime() - 7 * 24 * 3600000) : null;

  if (diffHours < 0) return { badge: '<span class="badge b-expired">⚠ Scaduto</span>', shortText: 'Scaduto ' + formatD(t.date), cardClass: 'c-coral', code: 'EXP' };
  if (diffHours <= 24) return { badge: '<span class="badge b-24h">≤ 24h</span>', shortText: formatD(t.date) + ' ' + (t.time || '12:00'), cardClass: 'c-coral', code: '24H' };
  if (diffHours <= 48) return { badge: '<span class="badge b-48h">≤ 48h</span>', shortText: formatD(t.date) + ' ' + (t.time || '12:00'), cardClass: 'c-coral', code: '48H' };
  if (hasMidCheck && !t.midDone && now >= midDate) return { badge: '<span class="badge b-mid">Verifica -7gg</span>', shortText: 'Verifica ' + formatD(t.date), cardClass: 'c-violet', code: 'MID' };

  const daysLeft = Math.ceil(diffHours / 24);
  return { badge: '<span class="badge b-ok">' + daysLeft + ' gg</span>', shortText: daysLeft + ' gg (' + formatD(t.date) + ')', cardClass: 'c-blue', code: 'OK' };
}

/* -------------------------------------------------------------------------
   FILTRI, ORDINAMENTO & RENDERING PRINCIPALE
   ------------------------------------------------------------------------- */
const STATUS_WEIGHT = { 'Da iniziare': 1, 'In lavorazione': 2, 'In verifica intermedia': 3, 'Pronto per consegna': 4, 'Completato': 5, 'Annullato': 6 };
const PRIO_WEIGHT   = { 'Critica / Flash': 1, 'Urgente': 2, 'Alta': 2, 'Ordinario': 3, 'Media': 3, 'Bassa': 4 };

function compareByDue(a, b) {
  if (a.date && b.date) return new Date(a.date + 'T' + (a.time || '12:00')) - new Date(b.date + 'T' + (b.time || '12:00'));
  if (a.date) return -1;
  if (b.date) return 1;
  return String(b.code || '').localeCompare(String(a.code || ''));
}

function compareAto(a, b) {
  const sa = String(a.ato || '').trim();
  const sb = String(b.ato || '').trim();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, 'it', { numeric: true, sensitivity: 'base' });
}

function getFilteredTasks() {
  const q = document.getElementById('f-search').value.toLowerCase();
  const secVal = getActiveSectionFilter();
  const tipo = document.getElementById('f-tipo').value;
  const dest = document.getElementById('f-dest').value;
  const st = document.getElementById('f-status').value;
  const sortMode = document.getElementById('f-sort').value;
  const dirMult = sortDirection === 'desc' ? -1 : 1;

  return tasks.filter(function(t) {
    if (hideCompleted && isClosedStatus(t.status)) return false;
    if (activeYearFilter && !matchesYearFilter(t, activeYearFilter)) return false;
    if (secVal && t.sec !== secVal) return false;
    if (onlyCriticalFilter) {
      const c = evaluateTask(t).code;
      if (c !== 'EXP' && c !== '24H' && c !== '48H') return false;
    }
    if (quickFilterPcn && !(t.pcnOut && !t.pcnIn)) return false;
    if (quickFilterMid && evaluateTask(t).code !== 'MID') return false;
    if (q) {
      const hay = [t.code, t.ato, t.title, t.prot, t.notes, t.classif].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (tipo && t.tipo !== tipo) return false;
    if (dest && normalizeApprover(t.dest) !== dest) return false;
    if (st && t.status !== st) return false;
    return true;
  }).sort(function(a, b) {
    let cmp = 0;
    if (sortMode === 'code') {
      cmp = String(b.code || '').localeCompare(String(a.code || ''), 'it', { numeric: true });
    } else if (sortMode === 'status') {
      const wa = STATUS_WEIGHT[a.status] || 99, wb = STATUS_WEIGHT[b.status] || 99;
      cmp = wa !== wb ? wa - wb : compareByDue(a, b);
    } else if (sortMode === 'prio') {
      const pa = PRIO_WEIGHT[a.prio] || 99, pb = PRIO_WEIGHT[b.prio] || 99;
      cmp = pa !== pb ? pa - pb : compareByDue(a, b);
    } else if (sortMode === 'ato') {
      const ca = compareAto(a, b);
      // I record senza ATO restano comunque in fondo
      if (!String(a.ato || '').trim() || !String(b.ato || '').trim()) return ca;
      cmp = ca;
    } else {
      // Scadenza: i task senza data restano sempre in fondo
      if (!a.date || !b.date) return compareByDue(a, b);
      cmp = compareByDue(a, b);
    }
    return cmp * dirMult;
  });
}

function updateSidebarCounters() {
  const secVal = getActiveSectionFilter();

  // Contatori per sezione (aggiornati in-place sui testi delle option, senza ricreare innerHTML!)
  const baseForSections = tasks.filter(function(t) {
    if (hideCompleted && isClosedStatus(t.status)) return false;
    if (activeYearFilter && !matchesYearFilter(t, activeYearFilter)) return false;
    return true;
  });

  const secSelect = document.getElementById('f-sec');
  if (secSelect) {
    const labels = {
      '': 'Tutte le Sezioni (' + baseForSections.length + ')',
      'NATO': '🔵 NATO (' + baseForSections.filter(function(t) { return t.sec === 'NATO'; }).length + ')',
      'UE': '🟡 UE (' + baseForSections.filter(function(t) { return t.sec === 'UE'; }).length + ')',
      'ONU': '🟣 ONU (' + baseForSections.filter(function(t) { return t.sec === 'ONU'; }).length + ')',
      'FOI': '🟢 FOI (' + baseForSections.filter(function(t) { return t.sec === 'FOI'; }).length + ')'
    };
    for (let i = 0; i < secSelect.options.length; i++) {
      const opt = secSelect.options[i];
      if (labels[opt.value] !== undefined && opt.textContent !== labels[opt.value]) {
        opt.textContent = labels[opt.value];
      }
    }
  }

  // Scope coerente con Anno e Sezione selezionati
  const scopedTasks = tasks.filter(function(t) {
    if (activeYearFilter && !matchesYearFilter(t, activeYearFilter)) return false;
    if (secVal && t.sec !== secVal) return false;
    return true;
  });

  // Campanella notifiche scadenze critiche (EXP, 24H, 48H) nello scope attivo
  let crit = 0;
  scopedTasks.forEach(function(t) {
    const c = evaluateTask(t).code;
    if (c === 'EXP' || c === '24H' || c === '48H') crit++;
  });
  const nb = document.getElementById('notif-count');
  nb.textContent = crit;
  nb.classList.toggle('hidden', crit === 0);
  const notifBtn = document.getElementById('btn-notif-crit');
  notifBtn.classList.toggle('is-active', onlyCriticalFilter);

  const critBanner = document.getElementById('crit-filter-banner');
  if (critBanner) critBanner.classList.toggle('hidden', !onlyCriticalFilter);

  // Filtri Rapidi 1-clic (Attesa PCN, Verifica -7gg, Mia Sez.)
  const pcnCount = scopedTasks.filter(function(t) {
    return !isClosedStatus(t.status) && Boolean(t.pcnOut && !t.pcnIn);
  }).length;
  const midCount = scopedTasks.filter(function(t) {
    return !isClosedStatus(t.status) && evaluateTask(t).code === 'MID';
  }).length;

  const pcnEl = document.getElementById('qf-pcn-cnt');
  if (pcnEl) pcnEl.textContent = pcnCount;
  const midEl = document.getElementById('qf-mid-cnt');
  if (midEl) midEl.textContent = midCount;

  const btnPcn = document.getElementById('btn-qf-pcn');
  if (btnPcn) btnPcn.classList.toggle('toggle-on', quickFilterPcn);

  const btnMid = document.getElementById('btn-qf-mid');
  if (btnMid) btnMid.classList.toggle('toggle-on', quickFilterMid);

  const btnMySec = document.getElementById('btn-qf-mysec');
  if (btnMySec) {
    const isSecUser = currentUser && currentUser.role !== 'admin' && VALID_SECTIONS.includes(currentUser.sec);
    btnMySec.classList.toggle('hidden', !isSecUser);
    if (isSecUser) {
      btnMySec.textContent = '👤 Mia Sez. (' + currentUser.sec + ')';
      btnMySec.classList.toggle('toggle-on', activeSecFilter === currentUser.sec);
    }
  }

  // Pulsante completati coerente con Anno e Sezione selezionati
  const completedCount = scopedTasks.filter(function(t) {
    return String(t.status || '').toLowerCase().startsWith('completat');
  }).length;
  const btnC = document.getElementById('btn-toggle-completed');
  document.getElementById('btn-completed-count').textContent = completedCount;
  btnC.classList.toggle('is-visible', !hideCompleted);
  btnC.classList.toggle('is-hidden', hideCompleted);
  btnC.title = hideCompleted
    ? 'I completati (' + completedCount + ') sono nascosti — clicca per mostrarli'
    : 'I completati (' + completedCount + ') sono visibili — clicca per nasconderli';
}

function updateTableSortIndicators() {
  const sortMode = document.getElementById('f-sort').value;
  document.querySelectorAll('th.sortable').forEach(function(th) {
    const key = th.getAttribute('data-sort');
    const ind = th.querySelector('.sort-ind');
    const isActive = key === sortMode;
    th.classList.toggle('sort-active', isActive);
    if (ind) {
      ind.textContent = isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅';
    }
  });
}

function setView(v) {
  currentView = v;
  ['board', 'list', 'cal', 'stats'].forEach(function(k) {
    document.getElementById('view-' + k).classList.toggle('hidden', k !== v);
    document.getElementById('btn-view-' + k).classList.toggle('active', k === v);
    document.getElementById('rail-' + k).classList.toggle('active', k === v);
  });
  document.getElementById('kanban-group-switch').classList.toggle('hidden', v !== 'board');
  render();
}

function setKanbanGroup(mode) {
  kanbanGroup = mode;
  document.getElementById('btn-grp-status').classList.toggle('active', mode === 'status');
  document.getElementById('btn-grp-sec').classList.toggle('active', mode === 'sec');
  render();
}

function renderKanbanCard(t) {
  const ev = evaluateTask(t);
  const editable = canEditTask(t);
  const isAdmin = currentUser && currentUser.role === 'admin';
  const canDragHere = (kanbanGroup === 'sec') ? Boolean(isAdmin) : Boolean(editable);
  const safeSec = sanitizeSection(t.sec);
  const safeId = escapeHtml(t.id);
  const secColor = SEC_COLORS[safeSec] || '#64748b';
  const secTextCol = (safeSec === 'UE') ? '#111827' : '#ffffff';
  const urgPill = (ev.code === 'EXP' || ev.code === '24H') ? '<span class="k-pill p-urg">' + (ev.code === 'EXP' ? 'SCADUTO' : '≤ 24h') + '</span>'
                : (ev.code === '48H') ? '<span class="k-pill p-warn">≤ 48h</span>'
                : (ev.code === 'MID') ? '<span class="k-pill p-mid">Verifica -7gg</span>' : '';

  const chkList = Array.isArray(t.checklist) ? t.checklist : [];
  const chkDone = chkList.filter(function(c) { return Boolean(c && c.done); }).length;
  const chkPill = chkList.length > 0
    ? '<span class="k-pill p-chk' + (chkDone === chkList.length ? ' all-done' : '') + '" title="Avanzamento passaggi interni">☑ ' + chkDone + '/' + chkList.length + '</span>'
    : '';

  return '<div class="k-card ' + ev.cardClass + '" draggable="' + (canDragHere ? 'true' : 'false') + '" data-task-id="' + safeId + '" data-action="edit" data-id="' + safeId + '">' +
    '<div class="k-top">' +
      '<div class="k-sec-av" style="background:' + secColor + '; color:' + secTextCol + ';" title="Sezione ' + safeSec + '">' + safeSec.slice(0, 2) + '</div>' +
      '<div class="k-title">' + escapeHtml(t.title) + '</div>' +
    '</div>' +
    '<div class="k-tags">' +
      '<span class="k-pill p-code">' + escapeHtml(t.code || '-') + '</span>' +
      urgPill +
      chkPill +
      '<span class="k-pill">' + escapeHtml(normalizeApprover(t.dest)) + '</span>' +
      (kanbanGroup === 'sec' ? '<span class="k-pill">' + escapeHtml(t.status) + '</span>' : '') +
      (t.ato ? '<span class="k-pill">ATO #' + escapeHtml(t.ato) + '</span>' : '') +
      (t.link ? '<button type="button" class="k-link-pill" data-action="open-link" data-id="' + safeId + '" title="' + escapeHtml(t.link) + '">Apri</button>' : '') +
    '</div>' +
    '<div class="k-foot">' +
      '<span>' + escapeHtml(ev.shortText) + '</span>' +
      '<span class="k-quick-btns">' +
        (editable && ev.code === 'MID' ? '<button type="button" data-action="mid-ok" data-id="' + safeId + '" title="Conferma verifica -7gg">✓ Verif.</button>' : '') +
        '<span>' + escapeHtml(t.prot && t.prot !== '//' ? 'Prot. ' + t.prot : (t.tipo || '')) + '</span>' +
      '</span>' +
    '</div>' +
  '</div>';
}

function renderKanban(list) {
  const board = document.getElementById('view-board');
  if (kanbanGroup === 'sec') {
    board.innerHTML = VALID_SECTIONS.map(function(sec) {
      const items = list.filter(function(t) { return t.sec === sec; });
      return '<div class="k-col" data-k-drop-sec="' + sec + '">' +
        '<div class="k-head"><span class="sec-badge sec-' + sec + '">' + sec + '</span> <span class="k-cnt">' + items.length + '</span></div>' +
        '<div class="k-body">' + items.map(renderKanbanCard).join('') + '</div>' +
      '</div>';
    }).join('');
    return;
  }

  // Modalità "Per Stato" (4 colonne pulite)
  const statusCols = [
    { key: 'Da iniziare', title: 'Da iniziare', match: function(s) { return s === 'Da iniziare'; } },
    { key: 'In lavorazione', title: 'In lavorazione', match: function(s) { return s === 'In lavorazione'; } },
    { key: 'In verifica intermedia', title: 'Verifica / Pronti', match: function(s) { return s === 'In verifica intermedia' || s === 'Pronto per consegna'; } },
    { key: 'Completato', title: 'Completati', match: function(s) { return isClosedStatus(s); } }
  ];

  board.innerHTML = statusCols.map(function(col) {
    const items = list.filter(function(t) { return col.match(t.status || 'In lavorazione'); });
    return '<div class="k-col" data-k-drop-status="' + col.key + '">' +
      '<div class="k-head">' + col.title + ' <span class="k-cnt">' + items.length + '</span></div>' +
      '<div class="k-body">' + items.map(renderKanbanCard).join('') + '</div>' +
    '</div>';
  }).join('');
}

function updateBatchBarUI(visibleList) {
  const currentList = Array.isArray(visibleList) ? visibleList : getFilteredTasks();
  const editableVisibleIds = currentList.filter(canEditTask).map(function(t) { return t.id; });

  const activeIdsSet = new Set(tasks.filter(canEditTask).map(function(t) { return t.id; }));
  selectedTaskIds.forEach(function(id) {
    if (!activeIdsSet.has(id)) selectedTaskIds.delete(id);
  });

  const bar = document.getElementById('batch-action-bar');
  if (bar) bar.classList.toggle('hidden', selectedTaskIds.size === 0);
  const countEl = document.getElementById('batch-sel-count');
  if (countEl) countEl.textContent = selectedTaskIds.size;

  const selectAll = document.getElementById('tbl-select-all');
  if (selectAll) {
    const allChecked = editableVisibleIds.length > 0 && editableVisibleIds.every(function(id) { return selectedTaskIds.has(id); });
    const someChecked = !allChecked && editableVisibleIds.some(function(id) { return selectedTaskIds.has(id); });
    selectAll.checked = allChecked;
    selectAll.indeterminate = someChecked;
  }
}

function renderTable(list) {
  updateTableSortIndicators();
  document.getElementById('table-body').innerHTML = list.map(function(t) {
    const ev = evaluateTask(t), editable = canEditTask(t);
    const safeSec = sanitizeSection(t.sec);
    const safeId = escapeHtml(t.id);
    const actions = editable
      ? '<button type="button" class="std-btn" style="padding:3px 7px;" data-action="edit" data-id="' + safeId + '">✏️</button> <button type="button" class="std-btn btn-danger" style="padding:3px 7px;" data-action="delete" data-id="' + safeId + '">🗑</button>'
      : '<button type="button" class="std-btn" style="padding:3px 7px;" data-action="edit" data-id="' + safeId + '">👁️</button>';
    return '<tr>' +
      '<td style="text-align:center;"><input type="checkbox" class="tbl-row-chk" data-chk-id="' + safeId + '"' + (selectedTaskIds.has(t.id) ? ' checked' : '') + (editable ? '' : ' disabled title="Sola lettura (altra sezione)"') + '></td>' +
      '<td><span class="code-badge">' + escapeHtml(t.code || '-') + '</span></td>' +
      '<td><b>' + escapeHtml(t.ato || '-') + '</b></td>' +
      '<td>' + ev.badge + '<br><small>' + (t.date ? escapeHtml(formatD(t.date) + ' ' + (t.time || '')) : '') + '</small></td>' +
      '<td><span class="sec-badge sec-' + safeSec + '">' + safeSec + '</span></td>' +
      '<td>' + escapeHtml(t.tipo) + '</td>' +
      '<td>' + escapeHtml(t.prio) + '</td>' +
      '<td><small>' + escapeHtml(t.classif) + '</small></td>' +
      '<td><b>' + escapeHtml(t.title) + '</b>' + (t.notes ? '<br><small style="color:var(--note-text);">📝 ' + escapeHtml(t.notes) + '</small>' : '') + (t.link ? '<br><button type="button" class="k-link-pill" data-action="open-link" data-id="' + safeId + '" title="' + escapeHtml(t.link) + '" style="margin-top:3px;">Apri</button>' : '') + '</td>' +
      '<td>' + escapeHtml(t.prot || '//') + '</td>' +
      '<td>' + escapeHtml(formatD(t.insDate)) + '</td>' +
      '<td><small>' + escapeHtml(formatD(t.pcnOut)) + '<br>' + escapeHtml(formatD(t.pcnIn)) + '</small></td>' +
      '<td><b>' + escapeHtml(t.status) + '</b></td>' +
      '<td><b>' + escapeHtml(normalizeApprover(t.dest)) + '</b></td>' +
      '<td style="white-space:nowrap;">' + actions + '</td>' +
    '</tr>';
  }).join('');
  updateBatchBarUI(list);
}

// Rendering selettivo: rigenera solo la vista attualmente attiva
function render() {
  updateSidebarCounters();
  if (currentView === 'stats') {
    renderStats();
    return;
  }
  const list = getFilteredTasks();
  if (currentView === 'board') {
    renderKanban(list);
  } else if (currentView === 'list') {
    renderTable(list);
  } else if (currentView === 'cal') {
    renderCalendar(list);
  }
}

/* -------------------------------------------------------------------------
   CALENDARIO MENSILE & SETTIMANALE (30 MIN + DRAG & DROP)
   ------------------------------------------------------------------------- */
function getSlotForTime(timeStr) {
  const parts = String(timeStr || '12:00').split(':');
  let h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  if (isNaN(h)) return '12:00';
  if (isNaN(m)) m = 0;
  let totalMins = h * 60 + (m >= 30 ? 30 : 0);
  if (totalMins < 450) totalMins = 450;
  if (totalMins > 1200) totalMins = 1200;
  return String(Math.floor(totalMins / 60)).padStart(2, '0') + ':' + String(totalMins % 60).padStart(2, '0');
}

function renderWeekCardHtml(t) {
  const ev = evaluateTask(t), editable = canEditTask(t);
  const safeSec = sanitizeSection(t.sec);
  const safeId = escapeHtml(t.id);
  const isPcnFallback = !t.date && Boolean(t.pcnIn);
  const safeTime = escapeHtml(t.time || '12:00');
  const btns = editable
    ? '<button type="button" data-action="edit" data-id="' + safeId + '" title="Modifica">✏️</button><button type="button" data-action="delete" data-id="' + safeId + '" title="Elimina" style="color:#dc2626;">🗑</button>'
    : '<button type="button" data-action="edit" data-id="' + safeId + '" title="Visualizza">👁️</button>';
  return '<div class="cal-week-card" draggable="' + (editable ? 'true' : 'false') + '" data-task-id="' + safeId + '" style="border-left-color:var(--' + safeSec.toLowerCase() + ')">' +
         '<div style="display:flex; justify-content:space-between; align-items:center; gap:4px;"><span class="code-badge">' + escapeHtml(t.code || safeSec) + '</span><span style="font-size:0.68rem; color:var(--today-text); font-weight:700;">' + (isPcnFallback ? '<span class="cal-pcn-tag" title="Mostrato su data Rientro PCN">PCN</span>' : '') + '⏰ ' + safeTime + '</span></div>' +
         '<div>' + ev.badge + '</div>' +
         '<div class="cal-week-title" data-action="edit" data-id="' + safeId + '" title="[' + escapeHtml(t.code || '') + '] ' + (isPcnFallback ? '(Rientro PCN) ' : '') + escapeHtml(t.title) + '">' + escapeHtml(t.title) + '</div>' +
         '<div class="cal-week-actions">' + btns + '</div></div>';
}

function renderCalendar(list) {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  // Preserva il nodo trascinato durante lo sfoglio del calendario in corso di Drag & Drop
  let stash = document.getElementById('cal-drag-stash');
  if (!stash) {
    stash = document.createElement('div');
    stash.id = 'cal-drag-stash';
    stash.style.display = 'none';
    document.body.appendChild(stash);
  }
  if (window.draggedCardNode && window.draggedCardNode.isConnected) {
    stash.appendChild(window.draggedCardNode);
  }

  const todayStr = toISODateLocal(new Date());
  const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  if (calMode === 'week') {
    const ref = new Date(calDate.getFullYear(), calDate.getMonth(), calDate.getDate());
    const monday = new Date(ref); monday.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    document.getElementById('cal-title').textContent = 'SETTIMANA: ' + monday.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }).toUpperCase() + ' — ' + sunday.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

    let html = '';
    for (let i = 0; i < 7; i++) {
      const curDay = new Date(monday); curDay.setDate(monday.getDate() + i);
      const dateStr = toISODateLocal(curDay), isToday = (dateStr === todayStr), hol = getItalianHolidayName(curDay);
      html += '<div class="cal-day-name' + (hol ? ' holiday-head' : '') + '" style="' + (isToday ? 'color:var(--today-text);' : '') + '">' + dayNames[i] + ' ' + curDay.getDate() + '/' + (curDay.getMonth() + 1) + (isToday ? ' (OGGI)' : '') + (hol && hol !== 'Domenica' ? '<br><small style="font-size:0.67rem;">' + escapeHtml(hol) + '</small>' : '') + '</div>';
    }
    for (let i = 0; i < 7; i++) {
      const curDay = new Date(monday); curDay.setDate(monday.getDate() + i);
      const dateStr = toISODateLocal(curDay), isToday = (dateStr === todayStr), hol = getItalianHolidayName(curDay);
      const dayTasks = list.filter(function(t) { return (t.date === dateStr) || (!t.date && t.pcnIn === dateStr); });
      let slotsHtml = '';
      TIME_SLOTS.forEach(function(slotTime) {
        const isExactHour = slotTime.endsWith(':00');
        const slotTasks = dayTasks.filter(function(t) { return getSlotForTime(t.time) === slotTime; });
        slotsHtml += '<div class="slot-box' + (isExactHour ? ' hour-mark' : '') + '" data-drop-date="' + dateStr + '" data-drop-time="' + slotTime + '"><div class="slot-label">' + (isExactHour ? '🕒 ' : '• ') + slotTime + '</div>' + slotTasks.map(renderWeekCardHtml).join('') + '</div>';
      });
      const cc = ['cal-cell', 'week-cell']; if (isToday) cc.push('today'); if (hol) cc.push('holiday-cell');
      html += '<div class="' + cc.join(' ') + '" data-drop-date="' + dateStr + '">' + slotsHtml + '</div>';
    }
    grid.innerHTML = html;
    return;
  }

  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('cal-title').textContent = new Date(y, m, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }).toUpperCase();
  const firstDay = (new Date(y, m, 1).getDay() + 6) % 7, daysInMonth = new Date(y, m + 1, 0).getDate();
  let html = dayNames.map(function(d, idx) { return '<div class="cal-day-name' + (idx === 6 ? ' holiday-head' : '') + '">' + d + '</div>'; }).join('');

  function renderMonthCell(curDay, isOtherMonth) {
    const dateStr = toISODateLocal(curDay), d = curDay.getDate(), isToday = (dateStr === todayStr), hol = getItalianHolidayName(curDay);
    const dayTasks = list.filter(function(t) { return (t.date === dateStr) || (!t.date && t.pcnIn === dateStr); });
    const itemsHtml = dayTasks.map(function(t) {
      const ed = canEditTask(t);
      const safeSec = sanitizeSection(t.sec);
      const safeId = escapeHtml(t.id);
      const isPcnFallback = !t.date && Boolean(t.pcnIn);
      const btns = ed ? '<button type="button" data-action="edit" data-id="' + safeId + '">✏️</button><button type="button" data-action="delete" data-id="' + safeId + '" style="color:#dc2626;">🗑</button>' : '<button type="button" data-action="edit" data-id="' + safeId + '">👁️</button>';
      return '<div class="cal-item" draggable="' + (ed ? 'true' : 'false') + '" data-task-id="' + safeId + '" style="border-left-color:var(--' + safeSec.toLowerCase() + ')">' +
             '<span class="cal-item-text" data-action="edit" data-id="' + safeId + '" title="[' + escapeHtml(t.code || safeSec) + '] ' + (isPcnFallback ? '(Rientro PCN) ' : '') + escapeHtml(t.title) + '">' + (isPcnFallback ? '<span class="cal-pcn-tag">PCN</span>' : '') + '<b>' + escapeHtml(t.code || safeSec) + '</b> ' + (t.time ? escapeHtml(t.time) + ' ' : '') + escapeHtml(t.title) + '</span>' +
             '<span class="cal-mini-actions">' + btns + '</span></div>';
    }).join('');
    const cc = ['cal-cell'];
    if (isOtherMonth) cc.push('other-month');
    if (isToday) cc.push('today');
    if (hol) cc.push('holiday-cell');
    const nc = ['cal-num'];
    if (isToday) nc.push('today-label');
    else if (hol) nc.push('holiday-label');
    const bh = (hol && hol !== 'Domenica') ? '<span class="holiday-tag">' + escapeHtml(hol) + '</span>' : (isToday ? '<span>OGGI</span>' : '');
    return '<div class="' + cc.join(' ') + '" data-drop-date="' + dateStr + '"><div class="' + nc.join(' ') + '"><span>' + d + '</span>' + bh + '</div>' + itemsHtml + '</div>';
  }

  const prevMonthLastDay = new Date(y, m, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    html += renderMonthCell(new Date(y, m - 1, prevMonthLastDay - i), true);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    html += renderMonthCell(new Date(y, m, d), false);
  }
  const totalFilled = firstDay + daysInMonth;
  const totalCells = Math.ceil(totalFilled / 7) * 7;
  const nextDays = totalCells - totalFilled;
  for (let d = 1; d <= nextDays; d++) {
    html += renderMonthCell(new Date(y, m + 1, d), true);
  }
  grid.innerHTML = html;
}

/* -------------------------------------------------------------------------
   STATISTICHE & GRAFICI
   ------------------------------------------------------------------------- */
function renderStats() {
  const selYear = document.getElementById('stats-year').value;
  const selSec  = document.getElementById('stats-sec').value;
  const subset = tasks.filter(function(t) {
    if (selYear && !matchesYearFilter(t, selYear)) return false;
    if (selSec && t.sec !== selSec) return false;
    return true;
  });

  const total = subset.length;
  const done = subset.filter(function(t) { return String(t.status || '').toLowerCase().startsWith('completat'); }).length;
  const canc = subset.filter(function(t) { return String(t.status || '').toLowerCase().startsWith('annullat'); }).length;
  const active = total - done - canc;
  const validBase = total - canc;
  const compPct = validBase > 0 ? Math.round((done / validBase) * 100) : 0;
  let critCount = 0;
  subset.forEach(function(t) { const c = evaluateTask(t).code; if (c === 'EXP' || c === '24H' || c === '48H') critCount++; });

  document.getElementById('stats-kpis').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Totale Pratiche</div><div class="kpi-val">' + total + '</div><div class="kpi-sub">' + (selYear ? 'Anno ' + escapeHtml(selYear) : 'Tutti gli anni') + (selSec ? ' • ' + escapeHtml(selSec) : ' • Ufficio OI') + '</div></div>' +
    '<div class="kpi-card" style="border-top-color:#22c55e;"><div class="kpi-label">Tasso Completamento</div><div class="kpi-val" style="color:#16a34a;">' + compPct + '%</div><div class="kpi-sub">' + done + ' completate su ' + validBase + ' valide (' + canc + ' ann.)</div></div>' +
    '<div class="kpi-card" style="border-top-color:#2589f5;"><div class="kpi-label">Attive / In Corso</div><div class="kpi-val" style="color:#2589f5;">' + active + '</div><div class="kpi-sub">Pratiche aperte da gestire</div></div>' +
    '<div class="kpi-card" style="border-top-color:#ef4444;"><div class="kpi-label">Critiche / ≤ 48h</div><div class="kpi-val" style="color:#ef4444;">' + critCount + '</div><div class="kpi-sub">Scadute o in consegna entro 48h</div></div>';

  // KPI Operativi Pacchetto 3: Tempi Medi & Puntualità
  let evasionSum = 0, evasionCount = 0;
  let pcnSum = 0, pcnDoneCount = 0, pcnWaitingCount = 0;
  let punctBase = 0, onTimeCount = 0;

  subset.forEach(function(t) {
    const isDone = String(t.status || '').toLowerCase().startsWith('completat');

    // 1. Tempo Medio Evasione (giorni)
    if (isDone) {
      const sStr = t.insDate || (t.createdAt ? t.createdAt.slice(0, 10) : '');
      const eStr = (t.completedAt ? t.completedAt.slice(0, 10) : '') || (t.updatedAt ? t.updatedAt.slice(0, 10) : '');
      if (sStr && eStr) {
        const dStart = new Date(sStr + 'T00:00:00').getTime();
        const dEnd = new Date(eStr + 'T00:00:00').getTime();
        if (!isNaN(dStart) && !isNaN(dEnd) && dEnd >= dStart) {
          evasionSum += (dEnd - dStart) / 86400000;
          evasionCount++;
        }
      }
    }

    // 2. Giacenza Media Prot./PCN (giorni)
    if (t.pcnOut && t.pcnIn) {
      const dOut = new Date(t.pcnOut + 'T00:00:00').getTime();
      const dIn = new Date(t.pcnIn + 'T00:00:00').getTime();
      if (!isNaN(dOut) && !isNaN(dIn) && dIn >= dOut) {
        pcnSum += (dIn - dOut) / 86400000;
        pcnDoneCount++;
      }
    } else if (t.pcnOut && !t.pcnIn && !isClosedStatus(t.status)) {
      pcnWaitingCount++;
    }

    // 3. Tasso di Puntualità (%)
    if (isDone && t.date) {
      punctBase++;
      const closeDateISO = (t.completedAt ? t.completedAt.slice(0, 10) : '') || (t.updatedAt ? t.updatedAt.slice(0, 10) : '');
      if (closeDateISO && closeDateISO <= t.date) {
        onTimeCount++;
      }
    }
  });

  const evasionVal = evasionCount > 0 ? (evasionSum / evasionCount).toFixed(1).replace('.', ',') + ' gg' : '—';
  const evasionSub = evasionCount > 0 ? (evasionCount + ' pratiche completate analizzate') : 'Nessuna completata con date';

  const pcnVal = pcnDoneCount > 0 ? (pcnSum / pcnDoneCount).toFixed(1).replace('.', ',') + ' gg' : '—';
  const pcnSub = (pcnDoneCount > 0 || pcnWaitingCount > 0) ? (pcnDoneCount + ' rientrate • ' + pcnWaitingCount + ' in attesa PCN') : 'Nessuna pratica con PCN';

  const punctVal = punctBase > 0 ? Math.round((onTimeCount / punctBase) * 100) + '%' : '—';
  const punctSub = punctBase > 0 ? (onTimeCount + ' su ' + punctBase + ' entro scadenza') : 'Nessuna completata con scadenza';

  const kpisOpsEl = document.getElementById('stats-kpis-ops');
  if (kpisOpsEl) {
    kpisOpsEl.innerHTML =
      '<div class="kpi-card" style="border-top-color:#0ea5e9;"><div class="kpi-label">Tempo Medio Evasione</div><div class="kpi-val" style="color:#0284c7;">' + evasionVal + '</div><div class="kpi-sub">' + evasionSub + '</div></div>' +
      '<div class="kpi-card" style="border-top-color:#f59e0b;"><div class="kpi-label">Giacenza Media Prot./PCN</div><div class="kpi-val" style="color:#d97706;">' + pcnVal + '</div><div class="kpi-sub">' + pcnSub + '</div></div>' +
      '<div class="kpi-card" style="border-top-color:#10b981;"><div class="kpi-label">Tasso di Puntualità</div><div class="kpi-val" style="color:#10b981;">' + punctVal + '</div><div class="kpi-sub">' + punctSub + '</div></div>';
  }

  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const mDone = new Array(12).fill(0), mAct = new Array(12).fill(0);
  subset.forEach(function(t) {
    const refDate = (selYear && t.date && t.date.startsWith(selYear)) ? t.date : (t.insDate || t.date || (t.createdAt ? t.createdAt.slice(0, 10) : ''));
    if (!refDate || refDate.length < 7) return;
    const mIdx = parseInt(refDate.slice(5, 7), 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      if (String(t.status || '').toLowerCase().startsWith('completat')) mDone[mIdx]++;
      else if (!String(t.status || '').toLowerCase().startsWith('annullat')) mAct[mIdx]++;
    }
  });
  const maxM = Math.max(1, ...mDone.map(function(v, i) { return v + mAct[i]; }));
  document.getElementById('chart-monthly').innerHTML = months.map(function(lbl, i) {
    const totM = mDone[i] + mAct[i];
    return '<div class="month-col" title="' + lbl + ': ' + totM + ' (' + mDone[i] + ' compl., ' + mAct[i] + ' attive)">' +
      '<div class="month-cnt">' + (totM || '') + '</div>' +
      '<div class="month-bar-wrap"><div class="month-seg-act" style="height:' + Math.round((mAct[i] / maxM) * 100) + '%;"></div><div class="month-seg-done" style="height:' + Math.round((mDone[i] / maxM) * 100) + '%;"></div></div>' +
      '<div class="month-lbl">' + lbl + '</div></div>';
  }).join('');

  const secCounts = { NATO: 0, UE: 0, ONU: 0, FOI: 0 };
  subset.forEach(function(t) { if (secCounts[t.sec] !== undefined) secCounts[t.sec]++; });
  const r = 56, circ = 2 * Math.PI * r;
  let offset = 0, circlesSvg = '';
  VALID_SECTIONS.forEach(function(s) {
    const dash = (total > 0 ? secCounts[s] / total : 0) * circ;
    if (dash > 0) {
      circlesSvg += '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="' + SEC_COLORS[s] + '" stroke-width="20" stroke-dasharray="' + dash.toFixed(2) + ' ' + circ.toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 75 75)"/>';
      offset += dash;
    }
  });
  document.getElementById('chart-sections').innerHTML =
    '<svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="' + r + '" fill="none" stroke="var(--bar-track)" stroke-width="20"/>' + circlesSvg +
    '<text x="75" y="72" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="800">' + total + '</text><text x="75" y="89" text-anchor="middle" fill="var(--muted)" font-size="10" font-weight="600">PRATICHE</text></svg>' +
    '<div class="donut-legend">' + VALID_SECTIONS.map(function(s) {
      const p = total > 0 ? Math.round((secCounts[s] / total) * 100) : 0;
      return '<div class="legend-row"><span><span class="legend-dot" style="background:' + SEC_COLORS[s] + '"></span><b>' + s + '</b></span><span><b>' + secCounts[s] + '</b> <small style="color:var(--muted);">(' + p + '%)</small></span></div>';
    }).join('') + '</div>';

  const stList = [
    { k: 'Da iniziare', c: '#64748b' }, { k: 'In lavorazione', c: '#2589f5' },
    { k: 'In verifica intermedia', c: '#8b5cf6' }, { k: 'Pronto per consegna', c: '#f59e0b' },
    { k: 'Completato', c: '#22c55e' }, { k: 'Annullato', c: '#ef4444' }
  ];
  document.getElementById('chart-status').innerHTML = stList.map(function(st) {
    const cnt = subset.filter(function(t) { return t.status === st.k; }).length;
    const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
    return '<div class="hbar-item"><div class="hbar-top"><span>' + st.k + '</span><span><b>' + cnt + '</b> (' + pct + '%)</span></div><div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%; background:' + st.c + ';"></div></div></div>';
  }).join('');

  document.getElementById('chart-approvers').innerHTML = APPROVERS_LIST.map(function(ap) {
    const cnt = subset.filter(function(t) { return normalizeApprover(t.dest) === ap; }).length;
    const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
    return '<div class="hbar-item"><div class="hbar-top"><span><b>' + ap + '</b></span><span>' + cnt + '</span></div><div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%; background:#eab308;"></div></div></div>';
  }).join('');

  document.getElementById('chart-types').innerHTML = ['Appunto', 'Coordinazione', 'Briefing', 'Schede', 'Flash Card', 'Dossier', 'Altro'].map(function(tp) {
    const cnt = subset.filter(function(t) { return (t.tipo || 'Altro') === tp; }).length;
    const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
    return '<div class="hbar-item"><div class="hbar-top"><span><b>' + tp + '</b></span><span>' + cnt + ' (' + pct + '%)</span></div><div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%; background:#06b6d4;"></div></div></div>';
  }).join('');
}

/* -------------------------------------------------------------------------
   PUNTO DI SITUAZIONE — GENERAZIONE HTML PER WORD / OUTLOOK / STAMPA
   ------------------------------------------------------------------------- */
function buildBriefingHtml(secFilter, includeDone7d) {
  const safeSec = secFilter ? sanitizeSection(secFilter) : '';
  const now = new Date();
  const dateStr = now.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const scopeLabel = safeSec ? ('SEZIONE ' + safeSec) : 'UFFICIO OI — TUTTE LE SEZIONI';

  // Filtra per sezione se specificata
  const baseList = tasks.filter(function(t) {
    if (safeSec && t.sec !== safeSec) return false;
    return true;
  });

  // Gruppo 1: Scadute e Critiche (≤ 48h)
  const gCrit = [];
  // Gruppo 2: In Verifica Intermedia (-7gg)
  const gMid = [];
  // Gruppo 3: Attive / In Lavorazione
  const gActive = [];
  // Gruppo 4: Concluse ultimi 7 giorni
  const gDone7 = [];

  const sevenDaysAgo = now.getTime() - (7 * 86400000);

  baseList.forEach(function(t) {
    const sLower = String(t.status || '').trim().toLowerCase();
    const isClosed = sLower.startsWith('completat') || sLower.startsWith('annullat');

    if (isClosed) {
      if (includeDone7d && sLower.startsWith('completat')) {
        const refDateStr = t.updatedAt || t.insDate || t.date || '';
        const refTime = refDateStr ? new Date(refDateStr).getTime() : 0;
        if (!isNaN(refTime) && refTime >= sevenDaysAgo) {
          gDone7.push(t);
        }
      }
      return;
    }

    const evalRes = evaluateTask(t);
    if (['EXP', '24H', '48H'].includes(evalRes.code)) {
      gCrit.push(t);
    } else if (evalRes.code === 'MID') {
      gMid.push(t);
    } else {
      gActive.push(t);
    }
  });

  gCrit.sort(compareByDue);
  gMid.sort(compareByDue);
  gActive.sort(compareByDue);
  gDone7.sort(compareByDue);

  function renderGroupTable(items, emptyMsg) {
    if (items.length === 0) {
      return '<div style="font-style:italic; color:#64748b; padding:8px 0; font-size:9.5pt;">' + emptyMsg + '</div>';
    }
    let html = '<table style="width:100%; border-collapse:collapse; margin-bottom:18px; font-family:Calibri,Segoe UI,Arial,sans-serif; font-size:9.5pt;">' +
      '<thead><tr style="background:#0f1b38; color:#ffffff; text-align:left;">' +
      '<th style="border:1px solid #cbd5e1; padding:6px 8px; width:11%;">Codice</th>' +
      '<th style="border:1px solid #cbd5e1; padding:6px 8px; width:7%;">Sez.</th>' +
      '<th style="border:1px solid #cbd5e1; padding:6px 8px;">Oggetto</th>' +
      '<th style="border:1px solid #cbd5e1; padding:6px 8px; width:11%;">Approv.</th>' +
      '<th style="border:1px solid #cbd5e1; padding:6px 8px; width:14%;">Scadenza</th>' +
      '<th style="border:1px solid #cbd5e1; padding:6px 8px; width:22%;">Stato / Note PCN</th>' +
      '</tr></thead><tbody>';

    items.forEach(function(t, idx) {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const secColor = SEC_COLORS[t.sec] || '#0284c7';
      let pcnBadge = '';
      if (t.pcnOut && !t.pcnIn) {
        pcnBadge = '<div style="margin-top:3px; font-weight:700; color:#d97706; font-size:8.5pt;">📤 In PCN dal ' + escapeHtml(formatD(t.pcnOut)) + '</div>';
      } else if (t.pcnOut && t.pcnIn) {
        pcnBadge = '<div style="margin-top:3px; color:#16a34a; font-size:8.5pt;">📥 Rientrato PCN il ' + escapeHtml(formatD(t.pcnIn)) + '</div>';
      }

      const dueStr = t.date ? (formatD(t.date) + (t.time ? (' ' + escapeHtml(t.time)) : '')) : '<span style="color:#94a3b8;">-</span>';
      const atoStr = t.ato ? (' <small style="color:#64748b;">(ATO: ' + escapeHtml(t.ato) + ')</small>') : '';

      html += '<tr style="background:' + rowBg + ';">' +
        '<td style="border:1px solid #cbd5e1; padding:6px 8px; font-weight:700; color:#0f172a;">' + escapeHtml(t.code || '-') + '</td>' +
        '<td style="border:1px solid #cbd5e1; padding:6px 8px;"><strong style="color:' + secColor + ';">' + escapeHtml(t.sec || '-') + '</strong></td>' +
        '<td style="border:1px solid #cbd5e1; padding:6px 8px; color:#1e293b;"><b>' + escapeHtml(t.title || '-') + '</b>' + atoStr + '</td>' +
        '<td style="border:1px solid #cbd5e1; padding:6px 8px; color:#334155;">' + escapeHtml(normalizeApprover(t.dest)) + '</td>' +
        '<td style="border:1px solid #cbd5e1; padding:6px 8px; font-weight:600;">' + dueStr + '</td>' +
        '<td style="border:1px solid #cbd5e1; padding:6px 8px; color:#334155;">' + escapeHtml(t.status || 'Da iniziare') + pcnBadge + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  let out = '<div style="font-family:Calibri,Segoe UI,Arial,sans-serif; color:#0f172a; line-height:1.4;">' +
    '<div style="border-bottom:2px solid #0f1b38; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap;">' +
    '<div>' +
    '<h2 style="margin:0 0 4px 0; font-size:15pt; color:#0f1b38; text-transform:uppercase; letter-spacing:0.5px;">UFFICIO OI — PUNTO DI SITUAZIONE</h2>' +
    '<div style="font-size:10pt; font-weight:700; color:#2563eb;">' + escapeHtml(scopeLabel) + '</div>' +
    '</div>' +
    '<div style="text-align:right; font-size:9pt; color:#64748b;">' +
    '<div>Generato il: <b>' + escapeHtml(dateStr) + ' ore ' + escapeHtml(timeStr) + '</b></div>' +
    '<div>Operatore: <b>' + escapeHtml(currentUser ? (currentUser.name + ' (' + currentUser.sec + ')') : 'Admin') + '</b></div>' +
    '</div>' +
    '</div>';

  // Box Riepilogo Numerico
  out += '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;">' +
    '<div style="flex:1; min-width:140px; background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; padding:8px 10px; border-radius:6px;">' +
    '<div style="font-size:8pt; text-transform:uppercase; font-weight:700; color:#991b1b;">Scadute &le; 48h</div>' +
    '<div style="font-size:16pt; font-weight:800; color:#b91c1c;">' + gCrit.length + '</div>' +
    '</div>' +
    '<div style="flex:1; min-width:140px; background:#faf5ff; border:1px solid #e9d5ff; border-left:4px solid #a855f7; padding:8px 10px; border-radius:6px;">' +
    '<div style="font-size:8pt; text-transform:uppercase; font-weight:700; color:#6b21a8;">Verifica -7gg</div>' +
    '<div style="font-size:16pt; font-weight:800; color:#7e22ce;">' + gMid.length + '</div>' +
    '</div>' +
    '<div style="flex:1; min-width:140px; background:#eff6ff; border:1px solid #bfdbfe; border-left:4px solid #3b82f6; padding:8px 10px; border-radius:6px;">' +
    '<div style="font-size:8pt; text-transform:uppercase; font-weight:700; color:#1e40af;">In Lavorazione</div>' +
    '<div style="font-size:16pt; font-weight:800; color:#1d4ed8;">' + gActive.length + '</div>' +
    '</div>' +
    (includeDone7d ? (
      '<div style="flex:1; min-width:140px; background:#f0fdf4; border:1px solid #bbf7d0; border-left:4px solid #22c55e; padding:8px 10px; border-radius:6px;">' +
      '<div style="font-size:8pt; text-transform:uppercase; font-weight:700; color:#166534;">Concluse 7gg</div>' +
      '<div style="font-size:16pt; font-weight:800; color:#15803d;">' + gDone7.length + '</div>' +
      '</div>'
    ) : '') +
    '</div>';

  // Sezione 1
  out += '<div style="margin-bottom:8px;"><h3 style="margin:0 0 6px 0; font-size:11pt; color:#991b1b; display:flex; align-items:center; gap:6px;">🔴 1. Pratiche Scadute &amp; Critiche (&le; 48 ore) (' + gCrit.length + ')</h3>' +
    renderGroupTable(gCrit, 'Nessuna pratica scaduta o critica.') +
    '</div>';

  // Sezione 2
  out += '<div style="margin-bottom:8px;"><h3 style="margin:0 0 6px 0; font-size:11pt; color:#6b21a8; display:flex; align-items:center; gap:6px;">🟣 2. Pratiche in Verifica Intermedia (-7gg) (' + gMid.length + ')</h3>' +
    renderGroupTable(gMid, 'Nessuna pratica in finestra di verifica intermedia.') +
    '</div>';

  // Sezione 3
  out += '<div style="margin-bottom:8px;"><h3 style="margin:0 0 6px 0; font-size:11pt; color:#1e40af; display:flex; align-items:center; gap:6px;">🔵 3. Pratiche Attive / In Lavorazione (' + gActive.length + ')</h3>' +
    renderGroupTable(gActive, 'Nessuna pratica in lavorazione.') +
    '</div>';

  // Sezione 4 (opzionale)
  if (includeDone7d) {
    out += '<div style="margin-bottom:8px;"><h3 style="margin:0 0 6px 0; font-size:11pt; color:#166534; display:flex; align-items:center; gap:6px;">🟢 4. Pratiche Concluse negli ultimi 7 giorni (' + gDone7.length + ')</h3>' +
      renderGroupTable(gDone7, 'Nessuna pratica conclusa negli ultimi 7 giorni.') +
      '</div>';
  }

  out += '</div>';
  return out;
}
