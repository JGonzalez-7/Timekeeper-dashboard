/* ===== Timekeeper App ===== */
(function () {
  'use strict';

  // ===== Storage =====
  const KEYS = { sessions: 'tk_sessions', events: 'tk_events', projects: 'tk_projects' };

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ===== Helpers =====
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function fmtTimerDisplay(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h + ':' + pad(m) + ':' + pad(sec);
  }

  function fmtTime12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return h12 + ':' + pad(m) + ' ' + ampm;
  }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayStr() { return dateStr(new Date()); }

  function weekStart() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  }

  function isToday(date) { return date === todayStr(); }

  function isTomorrow(date) {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return date === dateStr(tmr);
  }

  function isOverdue(date, status) {
    if (status === 'completed' || status === 'cancelled') return false;
    return date < todayStr();
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ===== Clock =====
  function updateClock() {
    const now = new Date();
    $('#headerClock').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  function updateDate() {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const s = now.toLocaleDateString('en-US', opts);
    $('#headerDate').textContent = s;
    $('#todayDate').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ===== Overview Totals =====
  function computeTotals() {
    const sessions = load(KEYS.sessions);
    const today = todayStr();
    const wStart = weekStart();

    let todayMs = 0;
    let weekMs = 0;

    sessions.forEach(function (s) {
      if (s.date === today) todayMs += s.duration;
      const sd = new Date(s.date + 'T00:00:00');
      if (sd >= wStart) weekMs += s.duration;
    });

    $('#todayTotal').textContent = fmtDuration(todayMs);
    $('#weekTotal').textContent = fmtDuration(weekMs);
  }

  function computeNextUp() {
    const events = load(KEYS.events);
    const projects = load(KEYS.projects);
    const today = todayStr();
    const all = [];

    events.forEach(function (e) {
      if (e.date >= today) all.push({ title: e.title, date: e.date, time: e.time, type: 'event' });
    });

    projects.forEach(function (p) {
      if (p.date >= today && p.status !== 'completed' && p.status !== 'cancelled')
        all.push({ title: p.title, date: p.date, time: p.time, type: p.type });
    });

    all.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });

    if (all.length) {
      const n = all[0];
      let label = n.title;
      if (n.time) label += ' at ' + fmtTime12(n.time);
      $('#nextUp').textContent = label;
    } else {
      $('#nextUp').textContent = 'Nothing scheduled';
    }
  }

  // ===== Timer =====
  let timerState = 'idle'; // idle | running | paused
  let timerStart = null;
  let timerElapsed = 0;
  let timerInterval = null;
  let timerTaskAtStart = '';

  const btnStart = $('#btnStart');
  const btnPause = $('#btnPause');
  const btnResume = $('#btnResume');
  const btnStop = $('#btnStop');
  const btnReset = $('#btnReset');
  const timerDisplay = $('#timerDisplay');
  const timerTask = $('#timerTask');

  function setTimerButtons(state) {
    btnStart.disabled = state !== 'idle';
    btnPause.disabled = state !== 'running';
    btnResume.disabled = state !== 'paused';
    btnStop.disabled = state === 'idle';
    btnReset.disabled = state === 'idle';
  }

  function updateTimerDisplay() {
    const elapsed = timerElapsed + (timerState === 'running' ? Date.now() - timerStart : 0);
    timerDisplay.textContent = fmtTimerDisplay(elapsed);
  }

  function startTimer() {
    timerState = 'running';
    timerStart = Date.now();
    timerElapsed = 0;
    timerTaskAtStart = timerTask.value.trim();
    timerInterval = setInterval(updateTimerDisplay, 200);
    setTimerButtons('running');
    updateTimerDisplay();
  }

  function pauseTimer() {
    timerElapsed += Date.now() - timerStart;
    timerState = 'paused';
    clearInterval(timerInterval);
    setTimerButtons('paused');
  }

  function resumeTimer() {
    timerState = 'running';
    timerStart = Date.now();
    timerInterval = setInterval(updateTimerDisplay, 200);
    setTimerButtons('running');
  }

  function stopTimer() {
    const elapsed = timerElapsed + (timerState === 'running' ? Date.now() - timerStart : 0);
    clearInterval(timerInterval);
    timerState = 'idle';

    if (elapsed >= 1000) {
      const session = {
        id: uid(),
        task: timerTask.value.trim() || timerTaskAtStart || 'Untitled session',
        date: todayStr(),
        startTime: new Date(Date.now() - elapsed).toTimeString().slice(0, 5),
        endTime: new Date().toTimeString().slice(0, 5),
        duration: elapsed
      };
      const sessions = load(KEYS.sessions);
      sessions.unshift(session);
      save(KEYS.sessions, sessions);
      renderSessions();
      computeTotals();
    }

    timerElapsed = 0;
    timerStart = null;
    timerDisplay.textContent = '0:00:00';
    timerTask.value = '';
    timerTaskAtStart = '';
    setTimerButtons('idle');
  }

  function resetTimer() {
    clearInterval(timerInterval);
    timerState = 'idle';
    timerElapsed = 0;
    timerStart = null;
    timerDisplay.textContent = '0:00:00';
    timerTask.value = '';
    timerTaskAtStart = '';
    setTimerButtons('idle');
  }

  btnStart.addEventListener('click', startTimer);
  btnPause.addEventListener('click', pauseTimer);
  btnResume.addEventListener('click', resumeTimer);
  btnStop.addEventListener('click', stopTimer);
  btnReset.addEventListener('click', resetTimer);

  // ===== Sessions =====
  function renderSessions() {
    const sessions = load(KEYS.sessions);
    const list = $('#sessionsList');

    if (!sessions.length) {
      list.innerHTML = '<p class="empty-state">No work sessions yet. Start the timer to begin tracking.</p>';
      return;
    }

    list.innerHTML = sessions.slice(0, 20).map(function (s) {
      return '<div class="session-item" data-id="' + s.id + '">' +
        '<div class="session-info">' +
          '<div class="session-task">' + escHtml(s.task) + '</div>' +
          '<div class="session-meta">' + s.date + (s.startTime ? ' &middot; ' + fmtTime12(s.startTime) + ' - ' + fmtTime12(s.endTime) : '') + '</div>' +
        '</div>' +
        '<span class="session-duration">' + fmtDuration(s.duration) + '</span>' +
        '<button class="btn-delete" data-delete-session="' + s.id + '" aria-label="Delete session" title="Delete">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
        '</button>' +
      '</div>';
    }).join('');
  }

  $('#sessionsList').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-delete-session]');
    if (!btn) return;
    const id = btn.dataset.deleteSession;
    let sessions = load(KEYS.sessions);
    sessions = sessions.filter(function (s) { return s.id !== id; });
    save(KEYS.sessions, sessions);
    renderSessions();
    computeTotals();
  });

  // ===== Events =====
  let editingEventId = null;

  function renderEvents() {
    const events = load(KEYS.events);
    const list = $('#eventsList');

    if (!events.length) {
      list.innerHTML = '<p class="empty-state">No upcoming events. Add one to get started.</p>';
      return;
    }

    const sorted = events.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });

    list.innerHTML = sorted.map(function (e) {
      const badges = [];
      if (isToday(e.date)) badges.push('<span class="badge badge--today">Today</span>');
      else if (isTomorrow(e.date)) badges.push('<span class="badge badge--tomorrow">Tomorrow</span>');

      return '<div class="item-card" data-id="' + e.id + '">' +
        '<div class="item-left">' +
          '<div class="item-title">' + escHtml(e.title) + '</div>' +
          '<div class="item-sub">' + e.date + (e.time ? ' &middot; ' + fmtTime12(e.time) : '') + (e.location ? ' &middot; ' + escHtml(e.location) : '') + '</div>' +
          (e.notes ? '<div class="item-sub">' + escHtml(e.notes) + '</div>' : '') +
          (badges.length ? '<div class="item-badges">' + badges.join('') + '</div>' : '') +
        '</div>' +
        '<div class="item-actions">' +
          '<button class="btn-delete" data-edit-event="' + e.id + '" aria-label="Edit event" title="Edit">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="btn-delete" data-delete-event="' + e.id + '" aria-label="Delete event" title="Delete">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function openEventModal(id) {
    editingEventId = id || null;
    const modal = $('#eventModal');
    const form = $('#eventForm');

    if (id) {
      const events = load(KEYS.events);
      const e = events.find(function (ev) { return ev.id === id; });
      if (!e) return;
      $('#eventModalTitle').textContent = 'Edit Event';
      $('#eventTitle').value = e.title;
      $('#eventDate').value = e.date;
      $('#eventTime').value = e.time || '';
      $('#eventLocation').value = e.location || '';
      $('#eventNotes').value = e.notes || '';
    } else {
      $('#eventModalTitle').textContent = 'Add Event';
      form.reset();
      $('#eventDate').value = todayStr();
    }

    modal.showModal();
    $('#eventTitle').focus();
  }

  function closeEventModal() {
    $('#eventModal').close();
    editingEventId = null;
  }

  $('#btnAddEvent').addEventListener('click', function () { openEventModal(); });
  $('#eventCancel').addEventListener('click', closeEventModal);
  $('#eventModal').addEventListener('close', function () { editingEventId = null; });

  $('#eventForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const title = $('#eventTitle').value.trim();
    const date = $('#eventDate').value;
    const time = $('#eventTime').value;
    const location = $('#eventLocation').value.trim();
    const notes = $('#eventNotes').value.trim();

    if (!title || !date) return;

    let events = load(KEYS.events);

    if (editingEventId) {
      events = events.map(function (ev) {
        if (ev.id === editingEventId) {
          return Object.assign({}, ev, { title: title, date: date, time: time, location: location, notes: notes });
        }
        return ev;
      });
    } else {
      events.push({ id: uid(), title: title, date: date, time: time, location: location, notes: notes });
    }

    save(KEYS.events, events);
    closeEventModal();
    renderEvents();
    renderCalendar();
    computeNextUp();
  });

  $('#eventsList').addEventListener('click', function (e) {
    const editBtn = e.target.closest('[data-edit-event]');
    const delBtn = e.target.closest('[data-delete-event]');

    if (editBtn) {
      openEventModal(editBtn.dataset.editEvent);
    } else if (delBtn) {
      let events = load(KEYS.events);
      events = events.filter(function (ev) { return ev.id !== delBtn.dataset.deleteEvent; });
      save(KEYS.events, events);
      renderEvents();
      renderCalendar();
      computeNextUp();
    }
  });

  // ===== Projects & Meetings =====
  let editingProjectId = null;

  function renderProjects() {
    const items = load(KEYS.projects);
    const list = $('#projectsList');

    if (!items.length) {
      list.innerHTML = '<p class="empty-state">No projects or meetings yet. Add one to get started.</p>';
      return;
    }

    const sorted = items.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });

    list.innerHTML = sorted.map(function (p) {
      const badges = [];
      badges.push('<span class="badge badge--' + p.type + '">' + p.type + '</span>');

      if (isOverdue(p.date, p.status)) badges.push('<span class="badge badge--overdue">Overdue</span>');
      badges.push('<span class="badge badge--' + p.status + '">' + p.status.replace('-', ' ') + '</span>');
      if (isToday(p.date)) badges.push('<span class="badge badge--today">Today</span>');
      else if (isTomorrow(p.date)) badges.push('<span class="badge badge--tomorrow">Tomorrow</span>');

      return '<div class="item-card" data-id="' + p.id + '">' +
        '<div class="item-left">' +
          '<div class="item-title">' + escHtml(p.title) + '</div>' +
          '<div class="item-sub">' + p.date + (p.time ? ' &middot; ' + fmtTime12(p.time) : '') + '</div>' +
          (p.description ? '<div class="item-sub">' + escHtml(p.description) + '</div>' : '') +
          '<div class="item-badges">' + badges.join('') + '</div>' +
        '</div>' +
        '<div class="item-actions">' +
          '<button class="btn-delete" data-edit-project="' + p.id + '" aria-label="Edit item" title="Edit">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="btn-delete" data-delete-project="' + p.id + '" aria-label="Delete item" title="Delete">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function openProjectModal(id) {
    editingProjectId = id || null;
    const modal = $('#projectModal');
    const form = $('#projectForm');

    if (id) {
      const items = load(KEYS.projects);
      const p = items.find(function (item) { return item.id === id; });
      if (!p) return;
      $('#projectModalTitle').textContent = 'Edit Project / Meeting';
      $('#projectType').value = p.type;
      $('#projectTitle').value = p.title;
      $('#projectDate').value = p.date;
      $('#projectTime').value = p.time || '';
      $('#projectStatus').value = p.status;
      $('#projectDesc').value = p.description || '';
    } else {
      $('#projectModalTitle').textContent = 'Add Project / Meeting';
      form.reset();
      $('#projectDate').value = todayStr();
      $('#projectType').value = 'project';
      $('#projectStatus').value = 'upcoming';
    }

    modal.showModal();
    $('#projectTitle').focus();
  }

  function closeProjectModal() {
    $('#projectModal').close();
    editingProjectId = null;
  }

  $('#btnAddProject').addEventListener('click', function () { openProjectModal(); });
  $('#projectCancel').addEventListener('click', closeProjectModal);
  $('#projectModal').addEventListener('close', function () { editingProjectId = null; });

  $('#projectForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const type = $('#projectType').value;
    const title = $('#projectTitle').value.trim();
    const date = $('#projectDate').value;
    const time = $('#projectTime').value;
    const status = $('#projectStatus').value;
    const description = $('#projectDesc').value.trim();

    if (!title || !date) return;

    let items = load(KEYS.projects);

    if (editingProjectId) {
      items = items.map(function (p) {
        if (p.id === editingProjectId) {
          return Object.assign({}, p, { type: type, title: title, date: date, time: time, status: status, description: description });
        }
        return p;
      });
    } else {
      items.push({ id: uid(), type: type, title: title, date: date, time: time, status: status, description: description });
    }

    save(KEYS.projects, items);
    closeProjectModal();
    renderProjects();
    renderCalendar();
    computeNextUp();
  });

  $('#projectsList').addEventListener('click', function (e) {
    const editBtn = e.target.closest('[data-edit-project]');
    const delBtn = e.target.closest('[data-delete-project]');

    if (editBtn) {
      openProjectModal(editBtn.dataset.editProject);
    } else if (delBtn) {
      let items = load(KEYS.projects);
      items = items.filter(function (p) { return p.id !== delBtn.dataset.deleteProject; });
      save(KEYS.projects, items);
      renderProjects();
      renderCalendar();
      computeNextUp();
    }
  });

  // ===== Calendar =====
  let calYear, calMonth, calSelectedDate;

  function initCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    calSelectedDate = null;
  }

  function renderCalendar() {
    const grid = $('#calendarGrid');
    const label = $('#calMonthLabel');
    label.textContent = MONTH_NAMES[calMonth] + ' ' + calYear;

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDays = new Date(calYear, calMonth, 0).getDate();
    const today = todayStr();

    // Compute marked dates
    const marked = {};
    load(KEYS.events).forEach(function (e) { marked[e.date] = (marked[e.date] || 0) + 1; });
    load(KEYS.projects).forEach(function (p) { marked[p.date] = (marked[p.date] || 0) + 1; });

    let html = DAY_NAMES.map(function (d) { return '<div class="cal-head">' + d + '</div>'; }).join('');

    // Previous month fill
    const startIdx = firstDay;
    for (let i = startIdx - 1; i >= 0; i--) {
      html += '<div class="cal-day cal-day--other">' + (prevDays - i) + '</div>';
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = calYear + '-' + pad(calMonth + 1) + '-' + pad(d);
      let cls = 'cal-day';
      if (ds === today) cls += ' cal-day--today';
      if (ds === calSelectedDate) cls += ' cal-day--selected';
      if (marked[ds]) cls += ' cal-day--marked';
      html += '<div class="' + cls + '" data-cal-date="' + ds + '">' + d + '</div>';
    }

    // Next month fill
    const totalCells = startIdx + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      html += '<div class="cal-day cal-day--other">' + i + '</div>';
    }

    grid.innerHTML = html;
    renderCalendarDayItems();
  }

  function renderCalendarDayItems() {
    const container = $('#calendarDayItems');

    if (!calSelectedDate) {
      container.innerHTML = '<p class="empty-state">Select a marked day to see items.</p>';
      return;
    }

    const events = load(KEYS.events).filter(function (e) { return e.date === calSelectedDate; });
    const projects = load(KEYS.projects).filter(function (p) { return p.date === calSelectedDate; });

    if (!events.length && !projects.length) {
      container.innerHTML = '<p class="empty-state">No items on this date.</p>';
      return;
    }

    let html = '';

    events.forEach(function (e) {
      html += '<div class="cal-item">' +
        '<span class="cal-item-dot cal-item-dot--event"></span>' +
        '<div class="cal-item-info">' +
          '<div class="cal-item-title">' + escHtml(e.title) + '</div>' +
          (e.time ? '<div class="cal-item-time">' + fmtTime12(e.time) + (e.location ? ' &middot; ' + escHtml(e.location) : '') + '</div>' : '') +
        '</div>' +
      '</div>';
    });

    projects.forEach(function (p) {
      html += '<div class="cal-item">' +
        '<span class="cal-item-dot cal-item-dot--' + p.type + '"></span>' +
        '<div class="cal-item-info">' +
          '<div class="cal-item-title">' + escHtml(p.title) + '</div>' +
          (p.time ? '<div class="cal-item-time">' + fmtTime12(p.time) + '</div>' : '') +
        '</div>' +
      '</div>';
    });

    container.innerHTML = html;
  }

  $('#calendarGrid').addEventListener('click', function (e) {
    const day = e.target.closest('[data-cal-date]');
    if (!day) return;
    calSelectedDate = day.dataset.calDate;
    renderCalendar();
  });

  $('#calPrev').addEventListener('click', function () {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    calSelectedDate = null;
    renderCalendar();
  });

  $('#calNext').addEventListener('click', function () {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    calSelectedDate = null;
    renderCalendar();
  });

  // ===== Init =====
  function init() {
    updateClock();
    updateDate();
    setInterval(updateClock, 1000);
    setInterval(updateDate, 60000);

    setTimerButtons('idle');
    renderSessions();
    renderEvents();
    renderProjects();
    initCalendar();
    renderCalendar();
    computeTotals();
    computeNextUp();
  }

  init();
})();