/* =========================================================
   views.js — Kanban (Stato/Sezione), Tabella, Calendario
   a 30 minuti e Statistiche con grafici.
   ========================================================= */

const APPROVERS_LIST  = ['CS', 'CU/VCU', 'VCR', 'CR', 'SCa.SMD', 'Ca.SMD', 'UG', 'Altro'];
const TIME_SLOTS = [
  '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00',
  '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
];

// Stato dell'interfaccia
let currentView = 'board';
let kanbanGroup = 'status'; // 'status' | 'sec'
let activeSecFilter = '';   // dalla sidebar
let activeYearFilter = '';  // dalla sidebar
let onlyCriticalFilter = false; // dalla campanella
let calDate = new Date();
let calMode = 'month';
let hideCompleted = true;

/* -------------------------------------------------------------------------
   ANNI, FESTIVI & VALUTAZIONE SCADENZE
   ------------------------------------------------------------------------- */
function populateYearLists() {
  const yearSet = new Set([String(new Date().getFullYear())]);
  tasks.forEach(function(t) { yearSet.add(getTaskYear(t)); });
  const years = Array.from(yearSet).sort(function(a, b) { return b.localeCompare(a); });

  // Popover year list
  const popList = document.getElementById('popover-year-list');
  if (popList) {
    popList.innerHTML =
      '<div class="popover-item' + (activeYearFilter === '' ? ' active' : '') + '" data-yr=""><span>📁 Tutti gli Anni</span> <span style="font-size:0.72rem; opacity:0.8;">(' + tasks.length + ')</span></div>' +
      years.map(function(y) {
        const cnt = tasks.filter(function(t) { return getTaskYear(t) === y; }).length;
        return '<div class="popover-item' + (activeYearFilter === y ? ' active' : '') + '" data-yr="' + y + '"><span>📁 Anno ' + y + '</span> <span style="font-size:0.72rem; opacity:0.8;">(' + cnt + ')</span></div>';
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
    sYear.innerHTML = years.map(function(y) { return '<option value="' + y + '">Anno ' + y + '</option>'; }).join('') + '<option value="">Tutti gli Anni</option>';
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
  const ins = t.insDate ? new Date(t.insDate + 'T09:00') : new Date(t.createdAt || now);
  const diffHours = (due - now) / 3600000;
  const totalDays = (due - ins) / (3600000 * 24);
  const hasMidCheck = totalDays >= 7;
  const midDate = hasMidCheck ? new Date(due.getTime() - 7 * 24 * 3600000) : null;

  if (diffHours < 0) return { badge: '<span class="badge b-expired">⚠ Scaduto</span>', shortText: 'Scaduto ' + formatD(t.date), cardClass: 'c-coral', code: 'EXP' };
  if (diffHours <= 24) return { badge: '<span class="badge b-24h">≤ 24h</span>', shortText: formatD(t.date) + ' ' + (t.time||'12:00'), cardClass: 'c-coral', code: '24H' };
  if (diffHours <= 48) return { badge: '<span class="badge b-48h">≤ 48h</span>', shortText: formatD(t.date) + ' ' + (t.time||'12:00'), cardClass: 'c-coral', code: '48H' };
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
  if (a.date && b.date) return new Date(a.date + 'T' + (a.time||'12:00')) - new Date(b.date + 'T' + (b.time||'12:00'));
  if (a.date) return -1;
  if (b.date) return 1;
  return String(b.code || '').localeCompare(String(a.code || ''));
}

function getFilteredTasks() {
  const q = document.getElementById('f-search').value.toLowerCase();
  const secEl = document.getElementById('f-sec');
  const secVal = secEl ? secEl.value : activeSecFilter;
  const tipo = document.getElementById('f-tipo').value;
  const dest = document.getElementById('f-dest').value;
  const st = document.getElementById('f-status').value;
  const sortMode = document.getElementById('f-sort').value;

  return tasks.filter(function(t) {
    if (hideCompleted && isClosedStatus(t.status)) return false;
    if (activeYearFilter && getTaskYear(t) !== activeYearFilter) return false;
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
    if (sortMode === 'code') return String(b.code || '').localeCompare(String(a.code || ''));
    if (sortMode === 'status') {
      const wa = STATUS_WEIGHT[a.status] || 99, wb = STATUS_WEIGHT[b.status] || 99;
      return wa !== wb ? wa - wb : compareByDue(a, b);
    }
    if (sortMode === 'prio') {
      const pa = PRIO_WEIGHT[a.prio] || 99, pb = PRIO_WEIGHT[b.prio] || 99;
      return pa !== pb ? pa - pb : compareByDue(a, b);
    }
    if (sortMode === 'ato') return (parseInt(a.ato) || 999999) - (parseInt(b.ato) || 999999);
    return compareByDue(a, b);
  });
}

function updateSidebarCounters() {
  const base = tasks.filter(function(t) {
    if (hideCompleted && isClosedStatus(t.status)) return false;
    if (activeYearFilter && getTaskYear(t) !== activeYearFilter) return false;
    return true;
  });

  const secSelect = document.getElementById('f-sec');
  if (secSelect) {
    const curVal = secSelect.value;
    const counts = {
      ALL: base.length,
      NATO: base.filter(function(t) { return t.sec === 'NATO'; }).length,
      UE: base.filter(function(t) { return t.sec === 'UE'; }).length,
      ONU: base.filter(function(t) { return t.sec === 'ONU'; }).length,
      FOI: base.filter(function(t) { return t.sec === 'FOI'; }).length
    };
    secSelect.innerHTML =
      '<option value="">Tutte le Sezioni (' + counts.ALL + ')</option>' +
      '<option value="NATO">🔵 NATO (' + counts.NATO + ')</option>' +
      '<option value="UE">🟡 UE (' + counts.UE + ')</option>' +
      '<option value="ONU">🟣 ONU (' + counts.ONU + ')</option>' +
      '<option value="FOI">🟢 FOI (' + counts.FOI + ')</option>';
    secSelect.value = curVal;
  }

  // Campanella notifiche scadenze critiche (EXP, 24H, 48H)
  let crit = 0;
  tasks.forEach(function(t) {
    const c = evaluateTask(t).code;
    if (c === 'EXP' || c === '24H' || c === '48H') crit++;
  });
  const nb = document.getElementById('notif-count');
  nb.textContent = crit;
  nb.classList.toggle('hidden', crit === 0);
  document.getElementById('btn-notif-crit').style.borderColor = onlyCriticalFilter ? '#ef4444' : '';

  // Pulsante completati: conta solo i completati (annullati esclusi)
  const completedCount = tasks.filter(function(t) {
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
  const secColor = SEC_COLORS[t.sec] || '#64748b';
  const secTextCol = (t.sec === 'UE') ? '#111827' : '#ffffff';
  const urgPill = (ev.code === 'EXP' || ev.code === '24H') ? '<span class="k-pill p-urg">' + (ev.code === 'EXP' ? 'SCADUTO' : '≤ 24h') + '</span>'
                : (ev.code === '48H') ? '<span class="k-pill p-warn">≤ 48h</span>'
                : (ev.code === 'MID') ? '<span class="k-pill p-mid">Verifica -7gg</span>' : '';

  return '<div class="k-card ' + ev.cardClass + '" draggable="' + (editable ? 'true' : 'false') + '" data-task-id="' + t.id + '" data-action="edit" data-id="' + t.id + '">' +
    '<div class="k-top">' +
      '<div class="k-sec-av" style="background:' + secColor + '; color:' + secTextCol + ';" title="Sezione ' + t.sec + '">' + t.sec.slice(0, 2) + '</div>' +
      '<div class="k-title">' + escapeHtml(t.title) + '</div>' +
    '</div>' +
    '<div class="k-tags">' +
      '<span class="k-pill p-code">' + escapeHtml(t.code || '-') + '</span>' +
      urgPill +
      '<span class="k-pill">' + escapeHtml(normalizeApprover(t.dest)) + '</span>' +
      (kanbanGroup === 'sec' ? '<span class="k-pill">' + escapeHtml(t.status) + '</span>' : '') +
      (t.ato ? '<span class="k-pill">ATO #' + escapeHtml(t.ato) + '</span>' : '') +
      (t.link ? '<button type="button" class="k-link-pill" data-action="open-link" data-id="' + t.id + '" title="' + escapeHtml(t.link) + '">Apri</button>' : '') +
    '</div>' +
    '<div class="k-foot">' +
      '<span>' + escapeHtml(ev.shortText) + '</span>' +
      '<span class="k-quick-btns">' +
        (editable && ev.code === 'MID' ? '<button type="button" data-action="mid-ok" data-id="' + t.id + '" title="Conferma verifica -7gg">✓ Verif.</button>' : '') +
        '<span>' + escapeHtml(t.prot && t.prot !== '//' ? 'Prot. ' + t.prot : (t.tipo || '')) + '</span>' +
      '</span>' +
    '</div>' +
  '</div>';
}

function renderKanban(list) {
  const board = document.getElementById('view-board');
  if (kanbanGroup === 'sec') {
    board.innerHTML = ['NATO', 'UE', 'ONU', 'FOI'].map(function(sec) {
      const items = list.filter(function(t) { return t.sec === sec; });
      return '<div class="k-col" data-k-drop-sec="' + sec + '">' +
        '<div class="k-head"><span class="sec-badge sec-' + sec + '">' + sec + '</span> <span class="k-cnt">' + items.length + '</span></div>' +
        '<div class="k-body">' + items.map(renderKanbanCard).join('') + '</div>' +
      '</div>';
    }).join('');
    return;
  }

  // Modalità "Per Stato" (4 colonne pulite come nell'esempio)
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

function render() {
  updateSidebarCounters();
  const list = getFilteredTasks();

  renderKanban(list);

  // Tabella
  document.getElementById('table-body').innerHTML = list.map(function(t) {
    const ev = evaluateTask(t), editable = canEditTask(t);
    const actions = editable
      ? '<button type="button" class="std-btn" style="padding:3px 7px;" data-action="edit" data-id="' + t.id + '">✏️</button> <button type="button" class="std-btn btn-danger" style="padding:3px 7px;" data-action="delete" data-id="' + t.id + '">🗑</button>'
      : '<button type="button" class="std-btn" style="padding:3px 7px;" data-action="edit" data-id="' + t.id + '">👁️</button>';
    return '<tr>' +
      '<td><span class="code-badge">' + escapeHtml(t.code || '-') + '</span></td>' +
      '<td><b>' + escapeHtml(t.ato || '-') + '</b></td>' +
      '<td>' + ev.badge + '<br><small>' + (t.date ? formatD(t.date) + ' ' + (t.time||'') : '') + '</small></td>' +
      '<td><span class="sec-badge sec-' + t.sec + '">' + t.sec + '</span></td>' +
      '<td>' + escapeHtml(t.tipo) + '</td>' +
      '<td>' + escapeHtml(t.prio) + '</td>' +
      '<td><small>' + escapeHtml(t.classif) + '</small></td>' +
      '<td><b>' + escapeHtml(t.title) + '</b>' + (t.notes ? '<br><small style="color:var(--note-text);">📝 ' + escapeHtml(t.notes) + '</small>' : '') + (t.link ? '<br><button type="button" class="k-link-pill" data-action="open-link" data-id="' + t.id + '" title="' + escapeHtml(t.link) + '" style="margin-top:3px;">Apri</button>' : '') + '</td>' +
      '<td>' + escapeHtml(t.prot || '//') + '</td>' +
      '<td>' + formatD(t.insDate) + '</td>' +
      '<td><small>' + formatD(t.pcnOut) + '<br>' + formatD(t.pcnIn) + '</small></td>' +
      '<td><b>' + escapeHtml(t.status) + '</b></td>' +
      '<td><b>' + escapeHtml(normalizeApprover(t.dest)) + '</b></td>' +
      '<td style="white-space:nowrap;">' + actions + '</td>' +
    '</tr>';
  }).join('');

  renderCalendar(list);
  if (currentView === 'stats') renderStats();
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
  const btns = editable
    ? '<button type="button" data-action="edit" data-id="' + t.id + '" title="Modifica">✏️</button><button type="button" data-action="delete" data-id="' + t.id + '" title="Elimina" style="color:#dc2626;">🗑</button>'
    : '<button type="button" data-action="edit" data-id="' + t.id + '" title="Visualizza">👁️</button>';
  return '<div class="cal-week-card" draggable="' + (editable ? 'true' : 'false') + '" data-task-id="' + t.id + '" style="border-left-color:var(--' + t.sec.toLowerCase() + ')">' +
         '<div style="display:flex; justify-content:space-between; align-items:center; gap:4px;"><span class="code-badge">' + escapeHtml(t.code || t.sec) + '</span><span style="font-size:0.68rem; color:var(--today-text); font-weight:700;">⏰ ' + (t.time || '12:00') + '</span></div>' +
         '<div>' + ev.badge + '</div>' +
         '<div class="cal-week-title" data-action="edit" data-id="' + t.id + '" title="[' + escapeHtml(t.code || '') + '] ' + escapeHtml(t.title) + '">' + escapeHtml(t.title) + '</div>' +
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
      html += '<div class="cal-day-name' + (hol ? ' holiday-head' : '') + '" style="' + (isToday ? 'color:var(--today-text);' : '') + '">' + dayNames[i] + ' ' + curDay.getDate() + '/' + (curDay.getMonth() + 1) + (isToday ? ' (OGGI)' : '') + (hol && hol !== 'Domenica' ? '<br><small style="font-size:0.67rem;">' + hol + '</small>' : '') + '</div>';
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
      const btns = ed ? '<button type="button" data-action="edit" data-id="' + t.id + '">✏️</button><button type="button" data-action="delete" data-id="' + t.id + '" style="color:#dc2626;">🗑</button>' : '<button type="button" data-action="edit" data-id="' + t.id + '">👁️</button>';
      return '<div class="cal-item" draggable="' + (ed ? 'true' : 'false') + '" data-task-id="' + t.id + '" style="border-left-color:var(--' + t.sec.toLowerCase() + ')">' +
             '<span class="cal-item-text" data-action="edit" data-id="' + t.id + '" title="[' + escapeHtml(t.code || t.sec) + '] ' + escapeHtml(t.title) + '"><b>' + escapeHtml(t.code || t.sec) + '</b> ' + (t.time ? t.time + ' ' : '') + escapeHtml(t.title) + '</span>' +
             '<span class="cal-mini-actions">' + btns + '</span></div>';
    }).join('');
    const cc = ['cal-cell'];
    if (isOtherMonth) cc.push('other-month');
    if (isToday) cc.push('today');
    if (hol) cc.push('holiday-cell');
    const nc = ['cal-num'];
    if (isToday) nc.push('today-label');
    else if (hol) nc.push('holiday-label');
    const bh = (hol && hol !== 'Domenica') ? '<span class="holiday-tag">' + hol + '</span>' : (isToday ? '<span>OGGI</span>' : '');
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
    if (selYear && getTaskYear(t) !== selYear) return false;
    if (selSec && t.sec !== selSec) return false;
    return true;
  });

  const total = subset.length;
  const done = subset.filter(function(t) { return String(t.status||'').toLowerCase().startsWith('completat'); }).length;
  const canc = subset.filter(function(t) { return String(t.status||'').toLowerCase().startsWith('annullat'); }).length;
  const active = total - done - canc;
  const validBase = total - canc;
  const compPct = validBase > 0 ? Math.round((done / validBase) * 100) : 0;
  let critCount = 0;
  subset.forEach(function(t) { const c = evaluateTask(t).code; if (c === 'EXP' || c === '24H' || c === '48H') critCount++; });

  document.getElementById('stats-kpis').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Totale Pratiche</div><div class="kpi-val">' + total + '</div><div class="kpi-sub">' + (selYear ? 'Anno ' + selYear : 'Tutti gli anni') + (selSec ? ' • ' + selSec : ' • Ufficio OI') + '</div></div>' +
    '<div class="kpi-card" style="border-top-color:#22c55e;"><div class="kpi-label">Tasso Completamento</div><div class="kpi-val" style="color:#16a34a;">' + compPct + '%</div><div class="kpi-sub">' + done + ' completate su ' + validBase + ' valide (' + canc + ' ann.)</div></div>' +
    '<div class="kpi-card" style="border-top-color:#2589f5;"><div class="kpi-label">Attive / In Corso</div><div class="kpi-val" style="color:#2589f5;">' + active + '</div><div class="kpi-sub">Pratiche aperte da gestire</div></div>' +
    '<div class="kpi-card" style="border-top-color:#ef4444;"><div class="kpi-label">Critiche / ≤ 48h</div><div class="kpi-val" style="color:#ef4444;">' + critCount + '</div><div class="kpi-sub">Scadute o in consegna entro 48h</div></div>';

  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const mDone = new Array(12).fill(0), mAct = new Array(12).fill(0);
  subset.forEach(function(t) {
    const refDate = t.insDate || t.date || (t.createdAt ? t.createdAt.slice(0, 10) : '');
    if (!refDate || refDate.length < 7) return;
    const mIdx = parseInt(refDate.slice(5, 7), 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      if (String(t.status||'').toLowerCase().startsWith('completat')) mDone[mIdx]++;
      else if (!String(t.status||'').toLowerCase().startsWith('annullat')) mAct[mIdx]++;
    }
  });
  const maxM = Math.max(1, ...mDone.map(function(v, i) { return v + mAct[i]; }));
  document.getElementById('chart-monthly').innerHTML = months.map(function(lbl, i) {
    const totM = mDone[i] + mAct[i];
    return '<div class="month-col" title="' + lbl + ': ' + totM + ' (' + mDone[i] + ' compl., ' + mAct[i] + ' attive)">' +
      '<div class="month-cnt">' + (totM || '') + '</div>' +
      '<div class="month-bar-wrap"><div class="month-seg-act" style="height:' + Math.round((mAct[i]/maxM)*100) + '%;"></div><div class="month-seg-done" style="height:' + Math.round((mDone[i]/maxM)*100) + '%;"></div></div>' +
      '<div class="month-lbl">' + lbl + '</div></div>';
  }).join('');

  const secCounts = { NATO: 0, UE: 0, ONU: 0, FOI: 0 };
  subset.forEach(function(t) { if (secCounts[t.sec] !== undefined) secCounts[t.sec]++; });
  const r = 56, circ = 2 * Math.PI * r;
  let offset = 0, circlesSvg = '';
  ['NATO', 'UE', 'ONU', 'FOI'].forEach(function(s) {
    const dash = (total > 0 ? secCounts[s] / total : 0) * circ;
    if (dash > 0) {
      circlesSvg += '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="' + SEC_COLORS[s] + '" stroke-width="20" stroke-dasharray="' + dash.toFixed(2) + ' ' + circ.toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 75 75)"/>';
      offset += dash;
    }
  });
  document.getElementById('chart-sections').innerHTML =
    '<svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="' + r + '" fill="none" stroke="var(--bar-track)" stroke-width="20"/>' + circlesSvg +
    '<text x="75" y="72" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="800">' + total + '</text><text x="75" y="89" text-anchor="middle" fill="var(--muted)" font-size="10" font-weight="600">PRATICHE</text></svg>' +
    '<div class="donut-legend">' + ['NATO', 'UE', 'ONU', 'FOI'].map(function(s) {
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
