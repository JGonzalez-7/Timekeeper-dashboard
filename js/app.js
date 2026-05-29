/* ===== Timekeeper App ===== */
(function () {
  'use strict';

  // ===== Storage =====
  var KEYS = { sessions: 'tk_sessions', events: 'tk_events', projects: 'tk_projects', meetings: 'tk_meetings' };

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (e) { return []; }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ===== Migration: split old combined projects/meetings into separate keys =====
  (function migrate() {
    // If meetings key exists already, migration already done
    if (localStorage.getItem(KEYS.meetings) !== null) return;
    var old = load(KEYS.projects);
    if (!old.length) return;
    var projects = [];
    var meetings = [];
    old.forEach(function (item) {
      if (item.type === 'meeting') {
        meetings.push({
          id: item.id,
          title: item.title,
          date: item.date,
          time: item.time || '',
          description: item.description || item.desc || ''
        });
      } else {
        projects.push({
          id: item.id,
          title: item.title,
          startDate: item.date || item.startDate || '',
          endDate: item.endDate || '',
          description: item.description || item.desc || ''
        });
      }
    });
    save(KEYS.projects, projects);
    save(KEYS.meetings, meetings);
  })();

  // ===== Helpers =====
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtDuration(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function fmtTimerDisplay(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h + ':' + pad(m) + ':' + pad(sec);
  }

  function fmtTime12(t) {
    if (!t) return '';
    var parts = t.split(':').map(Number);
    var h = parts[0];
    var m = parts[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return h12 + ':' + pad(m) + ' ' + ampm;
  }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayStr() { return dateStr(new Date()); }

  function weekStart() {
    var d = new Date();
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    var start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  }

  function isToday(date) { return date === todayStr(); }

  function isTomorrow(date) {
    var tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return date === dateStr(tmr);
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ===== Clock =====
  function updateClock() {
    var now = new Date();
    $('#headerClock').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  function updateDate() {
    var now = new Date();
    var opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    var s = now.toLocaleDateString('en-US', opts);
    $('#headerDate').textContent = s;
    $('#todayDate').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ===== Overview Totals =====
  function computeTotals() {
    var sessions = load(KEYS.sessions);
    var today = todayStr();
    var wStart = weekStart();

    var todayMs = 0;
    var weekMs = 0;

    sessions.forEach(function (s) {
      if (s.date === today) todayMs += s.duration;
      var sd = new Date(s.date + 'T00:00:00');
      if (sd >= wStart) weekMs += s.duration;
    });

    $('#todayTotal').textContent = fmtDuration(todayMs);
    $('#weekTotal').textContent = fmtDuration(weekMs);
  }

  function computeNextUp() {
    var events = load(KEYS.events);
    var projects = load(KEYS.projects);
    var meetings = load(KEYS.meetings);
    var today = todayStr();
    var all = [];

    events.forEach(function (e) {
      if (e.date >= today) all.push({ title: e.title, date: e.date, time: e.time, type: 'event' });
    });

    projects.forEach(function (p) {
      if (p.startDate && p.startDate >= today && !p.endDate)
        all.push({ title: p.title, date: p.startDate, time: '', type: 'project' });
    });

    meetings.forEach(function (m) {
      if (m.date >= today) all.push({ title: m.title, date: m.date, time: m.time, type: 'meeting' });
    });

    all.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });

    if (all.length) {
      var n = all[0];
      var label = n.title;
      if (n.time) label += ' at ' + fmtTime12(n.time);
      $('#nextUp').textContent = label;
    } else {
      $('#nextUp').textContent = 'Nothing scheduled';
    }
  }

  // ===== Timer =====
  var timerState = 'idle';
  var timerStart = null;
  var timerElapsed = 0;
  var timerInterval = null;
  var timerTaskAtStart = '';

  var btnStart = $('#btnStart');
  var btnPause = $('#btnPause');
  var btnResume = $('#btnResume');
  var btnStop = $('#btnStop');
  var btnReset = $('#btnReset');
  var timerDisplay = $('#timerDisplay');
  var timerTask = $('#timerTask');

  function setTimerButtons(state) {
    btnStart.disabled = state !== 'idle';
    btnPause.disabled = state !== 'running';
    btnResume.disabled = state !== 'paused';
    btnStop.disabled = state === 'idle';
    btnReset.disabled = state === 'idle';
  }

  function updateTimerDisplay() {
    var elapsed = timerElapsed + (timerState === 'running' ? Date.now() - timerStart : 0);
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
    var elapsed = timerElapsed + (timerState === 'running' ? Date.now() - timerStart : 0);
    clearInterval(timerInterval);
    timerState = 'idle';

    if (elapsed >= 1000) {
      var session = {
        id: uid(),
        task: timerTask.value.trim() || timerTaskAtStart || 'Untitled session',
        date: todayStr(),
        startTime: new Date(Date.now() - elapsed).toTimeString().slice(0, 5),
        endTime: new Date().toTimeString().slice(0, 5),
        duration: elapsed
      };
      var sessions = load(KEYS.sessions);
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
    var sessions = load(KEYS.sessions);
    var list = $('#sessionsList');

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
    var btn = e.target.closest('[data-delete-session]');
    if (!btn) return;
    var id = btn.dataset.deleteSession;
    var sessions = load(KEYS.sessions).filter(function (s) { return s.id !== id; });
    save(KEYS.sessions, sessions);
    renderSessions();
    computeTotals();
  });

  // ===== Events =====
  var editingEventId = null;

  function renderEvents() {
    var events = load(KEYS.events);
    var list = $('#eventsList');

    if (!events.length) {
      list.innerHTML = '<p class="empty-state">No upcoming events. Add one to get started.</p>';
      return;
    }

    var sorted = events.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });

    list.innerHTML = sorted.map(function (e) {
      var badges = [];
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
    var modal = $('#eventModal');
    var form = $('#eventForm');

    if (id) {
      var events = load(KEYS.events);
      var e = events.find(function (ev) { return ev.id === id; });
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
    var title = $('#eventTitle').value.trim();
    var date = $('#eventDate').value;
    var time = $('#eventTime').value;
    var location = $('#eventLocation').value.trim();
    var notes = $('#eventNotes').value.trim();

    if (!title || !date) return;

    var events = load(KEYS.events);

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
    var editBtn = e.target.closest('[data-edit-event]');
    var delBtn = e.target.closest('[data-delete-event]');

    if (editBtn) {
      openEventModal(editBtn.dataset.editEvent);
    } else if (delBtn) {
      var events = load(KEYS.events).filter(function (ev) { return ev.id !== delBtn.dataset.deleteEvent; });
      save(KEYS.events, events);
      renderEvents();
      renderCalendar();
      computeNextUp();
    }
  });

  // ===== Projects =====
  var editingProjectId = null;

  function getProjectStatus(p) {
    if (p.endDate) return 'completed';
    return 'in-progress';
  }

  function isProjectOverdue(p) {
    if (p.endDate) return false;
    return p.startDate < todayStr();
  }

  function renderProjects() {
    var items = load(KEYS.projects);
    var list = $('#projectsList');

    if (!items.length) {
      list.innerHTML = '<p class="empty-state">No projects yet. Add one to get started.</p>';
      return;
    }

    var sorted = items.slice().sort(function (a, b) {
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      return 0;
    });

    list.innerHTML = sorted.map(function (p) {
      var badges = [];
      var status = getProjectStatus(p);
      badges.push('<span class="badge badge--project">Project</span>');
      badges.push('<span class="badge badge--' + status + '">' + (status === 'in-progress' ? 'In Progress' : 'Completed') + '</span>');
      if (isProjectOverdue(p)) badges.push('<span class="badge badge--overdue">Overdue</span>');
      if (isToday(p.startDate)) badges.push('<span class="badge badge--today">Today</span>');
      else if (isTomorrow(p.startDate)) badges.push('<span class="badge badge--tomorrow">Tomorrow</span>');

      var dateLine = p.startDate;
      if (p.endDate) dateLine += ' &middot; End: ' + p.endDate;

      return '<div class="item-card" data-id="' + p.id + '">' +
        '<div class="item-left">' +
          '<div class="item-title">' + escHtml(p.title) + '</div>' +
          '<div class="item-sub">' + dateLine + '</div>' +
          (p.description ? '<div class="item-sub">' + escHtml(p.description) + '</div>' : '') +
          '<div class="item-badges">' + badges.join('') + '</div>' +
        '</div>' +
        '<div class="item-actions">' +
          '<button class="btn-delete" data-edit-project="' + p.id + '" aria-label="Edit project" title="Edit">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="btn-delete" data-delete-project="' + p.id + '" aria-label="Delete project" title="Delete">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function openProjectModal(id) {
    editingProjectId = id || null;
    var modal = $('#projectModal');
    var form = $('#projectForm');

    if (id) {
      var items = load(KEYS.projects);
      var p = items.find(function (item) { return item.id === id; });
      if (!p) return;
      $('#projectModalTitle').textContent = 'Edit Project';
      $('#projectTitle').value = p.title;
      $('#projectStartDate').value = p.startDate || '';
      $('#projectEndDate').value = p.endDate || '';
      $('#projectDesc').value = p.description || '';
    } else {
      $('#projectModalTitle').textContent = 'Add Project';
      form.reset();
      $('#projectStartDate').value = todayStr();
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
    var title = $('#projectTitle').value.trim();
    var startDate = $('#projectStartDate').value;
    var endDate = $('#projectEndDate').value;
    var description = $('#projectDesc').value.trim();

    if (!title || !startDate) return;

    var items = load(KEYS.projects);

    if (editingProjectId) {
      items = items.map(function (p) {
        if (p.id === editingProjectId) {
          return Object.assign({}, p, { title: title, startDate: startDate, endDate: endDate, description: description });
        }
        return p;
      });
    } else {
      items.push({ id: uid(), title: title, startDate: startDate, endDate: endDate, description: description });
    }

    save(KEYS.projects, items);
    closeProjectModal();
    renderProjects();
    renderCalendar();
    computeNextUp();
  });

  $('#projectsList').addEventListener('click', function (e) {
    var editBtn = e.target.closest('[data-edit-project]');
    var delBtn = e.target.closest('[data-delete-project]');

    if (editBtn) {
      openProjectModal(editBtn.dataset.editProject);
    } else if (delBtn) {
      var items = load(KEYS.projects).filter(function (p) { return p.id !== delBtn.dataset.deleteProject; });
      save(KEYS.projects, items);
      renderProjects();
      renderCalendar();
      computeNextUp();
    }
  });

  // ===== Meetings =====
  var editingMeetingId = null;

  function renderMeetings() {
    var items = load(KEYS.meetings);
    var list = $('#meetingsList');

    if (!items.length) {
      list.innerHTML = '<p class="empty-state">No meetings yet. Add one to get started.</p>';
      return;
    }

    var sorted = items.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });

    list.innerHTML = sorted.map(function (m) {
      var badges = [];
      badges.push('<span class="badge badge--meeting">Meeting</span>');
      var isPast = m.date < todayStr();
      if (isPast) badges.push('<span class="badge badge--overdue">Past</span>');
      if (isToday(m.date)) badges.push('<span class="badge badge--today">Today</span>');
      else if (isTomorrow(m.date)) badges.push('<span class="badge badge--tomorrow">Tomorrow</span>');

      return '<div class="item-card" data-id="' + m.id + '">' +
        '<div class="item-left">' +
          '<div class="item-title">' + escHtml(m.title) + '</div>' +
          '<div class="item-sub">' + m.date + (m.time ? ' &middot; ' + fmtTime12(m.time) : '') + '</div>' +
          (m.description ? '<div class="item-sub">' + escHtml(m.description) + '</div>' : '') +
          '<div class="item-badges">' + badges.join('') + '</div>' +
        '</div>' +
        '<div class="item-actions">' +
          '<button class="btn-delete" data-edit-meeting="' + m.id + '" aria-label="Edit meeting" title="Edit">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="btn-delete" data-delete-meeting="' + m.id + '" aria-label="Delete meeting" title="Delete">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function openMeetingModal(id) {
    editingMeetingId = id || null;
    var modal = $('#meetingModal');
    var form = $('#meetingForm');

    if (id) {
      var items = load(KEYS.meetings);
      var m = items.find(function (item) { return item.id === id; });
      if (!m) return;
      $('#meetingModalTitle').textContent = 'Edit Meeting';
      $('#meetingTitle').value = m.title;
      $('#meetingDate').value = m.date;
      $('#meetingTime').value = m.time || '';
      $('#meetingDesc').value = m.description || '';
    } else {
      $('#meetingModalTitle').textContent = 'Add Meeting';
      form.reset();
      $('#meetingDate').value = todayStr();
    }

    modal.showModal();
    $('#meetingTitle').focus();
  }

  function closeMeetingModal() {
    $('#meetingModal').close();
    editingMeetingId = null;
  }

  $('#btnAddMeeting').addEventListener('click', function () { openMeetingModal(); });
  $('#meetingCancel').addEventListener('click', closeMeetingModal);
  $('#meetingModal').addEventListener('close', function () { editingMeetingId = null; });

  $('#meetingForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('#meetingTitle').value.trim();
    var date = $('#meetingDate').value;
    var time = $('#meetingTime').value;
    var description = $('#meetingDesc').value.trim();

    if (!title || !date) return;

    var items = load(KEYS.meetings);

    if (editingMeetingId) {
      items = items.map(function (m) {
        if (m.id === editingMeetingId) {
          return Object.assign({}, m, { title: title, date: date, time: time, description: description });
        }
        return m;
      });
    } else {
      items.push({ id: uid(), title: title, date: date, time: time, description: description });
    }

    save(KEYS.meetings, items);
    closeMeetingModal();
    renderMeetings();
    renderCalendar();
    computeNextUp();
  });

  $('#meetingsList').addEventListener('click', function (e) {
    var editBtn = e.target.closest('[data-edit-meeting]');
    var delBtn = e.target.closest('[data-delete-meeting]');

    if (editBtn) {
      openMeetingModal(editBtn.dataset.editMeeting);
    } else if (delBtn) {
      var items = load(KEYS.meetings).filter(function (m) { return m.id !== delBtn.dataset.deleteMeeting; });
      save(KEYS.meetings, items);
      renderMeetings();
      renderCalendar();
      computeNextUp();
    }
  });

  // ===== Calendar =====
  var calYear, calMonth, calSelectedDate;

  function initCalendar() {
    var now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    calSelectedDate = null;
  }

  function renderCalendar() {
    var grid = $('#calendarGrid');
    var label = $('#calMonthLabel');
    label.textContent = MONTH_NAMES[calMonth] + ' ' + calYear;

    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var prevDays = new Date(calYear, calMonth, 0).getDate();
    var today = todayStr();

    // Compute marked dates from all sources
    var marked = {};
    load(KEYS.events).forEach(function (e) { marked[e.date] = (marked[e.date] || 0) + 1; });
    load(KEYS.projects).forEach(function (p) { marked[p.startDate] = (marked[p.startDate] || 0) + 1; if (p.endDate) marked[p.endDate] = (marked[p.endDate] || 0) + 1; });
    load(KEYS.meetings).forEach(function (m) { marked[m.date] = (marked[m.date] || 0) + 1; });

    var html = DAY_NAMES.map(function (d) { return '<div class="cal-head">' + d + '</div>'; }).join('');

    // Previous month fill
    var startIdx = firstDay;
    for (var i = startIdx - 1; i >= 0; i--) {
      html += '<div class="cal-day cal-day--other">' + (prevDays - i) + '</div>';
    }

    // Current month
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = calYear + '-' + pad(calMonth + 1) + '-' + pad(d);
      var cls = 'cal-day';
      if (ds === today) cls += ' cal-day--today';
      if (ds === calSelectedDate) cls += ' cal-day--selected';
      if (marked[ds]) cls += ' cal-day--marked';
      html += '<div class="' + cls + '" data-cal-date="' + ds + '">' + d + '</div>';
    }

    // Next month fill
    var totalCells = startIdx + daysInMonth;
    var remaining = (7 - (totalCells % 7)) % 7;
    for (var j = 1; j <= remaining; j++) {
      html += '<div class="cal-day cal-day--other">' + j + '</div>';
    }

    grid.innerHTML = html;
    renderCalendarDayItems();
  }

  function renderCalendarDayItems() {
    var container = $('#calendarDayItems');

    if (!calSelectedDate) {
      container.innerHTML = '<p class="empty-state">Select a marked day to see items.</p>';
      return;
    }

    var dateFilter = calSelectedDate;
    var evItems = load(KEYS.events).filter(function (e) { return e.date === dateFilter; });
    var projItems = load(KEYS.projects).filter(function (p) { return p.startDate === dateFilter || (p.endDate && p.endDate === dateFilter); });
    var meetItems = load(KEYS.meetings).filter(function (m) { return m.date === dateFilter; });

    if (!evItems.length && !projItems.length && !meetItems.length) {
      container.innerHTML = '<p class="empty-state">No items on this date.</p>';
      return;
    }

    var html = '';

    evItems.forEach(function (e) {
      html += '<div class="cal-item">' +
        '<span class="cal-item-dot cal-item-dot--event"></span>' +
        '<div class="cal-item-info">' +
          '<div class="cal-item-title">' + escHtml(e.title) + '</div>' +
          (e.time ? '<div class="cal-item-time">' + fmtTime12(e.time) + (e.location ? ' &middot; ' + escHtml(e.location) : '') + '</div>' : '') +
        '</div>' +
      '</div>';
    });

    projItems.forEach(function (p) {
      html += '<div class="cal-item">' +
        '<span class="cal-item-dot cal-item-dot--project"></span>' +
        '<div class="cal-item-info">' +
          '<div class="cal-item-title">' + escHtml(p.title) + '</div>' +
          '<div class="cal-item-time">Start: ' + p.startDate + (p.endDate ? ' &middot; End: ' + p.endDate : '') + '</div>' +
        '</div>' +
      '</div>';
    });

    meetItems.forEach(function (m) {
      html += '<div class="cal-item">' +
        '<span class="cal-item-dot cal-item-dot--meeting"></span>' +
        '<div class="cal-item-info">' +
          '<div class="cal-item-title">' + escHtml(m.title) + '</div>' +
          (m.time ? '<div class="cal-item-time">' + fmtTime12(m.time) + '</div>' : '') +
        '</div>' +
      '</div>';
    });

    container.innerHTML = html;
  }

  $('#calendarGrid').addEventListener('click', function (e) {
    var day = e.target.closest('[data-cal-date]');
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
    renderMeetings();
    initCalendar();
    renderCalendar();
    computeTotals();
    computeNextUp();
  }

  init();
})();