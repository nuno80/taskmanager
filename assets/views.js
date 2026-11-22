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
let calDate = new Date();
let calMode = 'month';
let hideCompleted = true;
let sortDirection = 'asc';  // 'asc' | 'desc'

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

  return '<div class="k-card ' + ev.cardClass + '" draggable="' + (canDragHere ? 'true' : 'false') + '" data-task-id="' + safeId + '" data-action="edit" data-id="' + safeId + '">' +
    '<div class="k-top">' +
      '<div class="k-sec-av" style="background:' + secColor + '; color:' + secTextCol + ';" title="Sezione ' + safeSec + '">' + safeSec.slice(0, 2) + '</div>' +
      '<div class="k-title">' + escapeHtml(t.title) + '</div>' +
    '</div>' +
    '<div class="k-tags">' +
      '<span class="k-pill p-code">' + escapeHtml(t.code || '-') + '</span>' +
      urgPill +
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
