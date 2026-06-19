/* ===== Timekeeper App ===== */
(function () {
  'use strict';

  // ===== Storage =====
  var KEYS = { sessions: 'sessions', events: 'events', projects: 'projects', meetings: 'meetings' };
  var LEGACY_KEYS = { sessions: 'tk_sessions', events: 'tk_events', projects: 'tk_projects', meetings: 'tk_meetings' };
  var API_URL = apiUrl();
  var store = { sessions: [], events: [], projects: [], meetings: [] };
  var storageReady = false;

  function apiUrl() {
    var configured = String(window.TIMEKEEPER_API_URL || '').trim().replace(/\/+$/, '');
    if (!configured) return '/api/data';
    if (/\/api\/data$/.test(configured)) return configured;
    return configured + '/api/data';
  }

  function load(key) {
    return store[key] || [];
  }

  function save(key, data) {
    store[key] = Array.isArray(data) ? data : [];
    if (storageReady) persist(key, store[key]).catch(function () {});
  }

  function persist(key, data) {
    return fetch(API_URL + '/' + encodeURIComponent(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error('Database save failed');
      return res.json();
    }).catch(function (err) {
      showDatabaseWarning('Database save failed. Check your MongoDB connection.');
      console.error(err);
      throw err;
    });
  }

  function legacyLoad(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (e) { return []; }
  }

  function clearLegacyStorage() {
    Object.keys(LEGACY_KEYS).forEach(function (name) {
      try { localStorage.removeItem(LEGACY_KEYS[name]); }
      catch (e) {}
    });
  }

  function legacyData() {
    var data = {
      sessions: legacyLoad(LEGACY_KEYS.sessions),
      events: legacyLoad(LEGACY_KEYS.events),
      projects: [],
      meetings: []
    };
    var oldProjects = legacyLoad(LEGACY_KEYS.projects);
    var hasSplitMeetings = false;

    try { hasSplitMeetings = localStorage.getItem(LEGACY_KEYS.meetings) !== null; }
    catch (e) { hasSplitMeetings = true; }

    if (hasSplitMeetings) {
      data.projects = oldProjects;
      data.meetings = legacyLoad(LEGACY_KEYS.meetings);
      return data;
    }

    oldProjects.forEach(function (item) {
      if (item.type === 'meeting') {
        data.meetings.push({
          id: item.id,
          title: item.title,
          date: item.date,
          time: item.time || '',
          description: item.description || item.desc || ''
        });
      } else {
        data.projects.push({
          id: item.id,
          title: item.title,
          startDate: item.date || item.startDate || '',
          endDate: item.endDate || '',
          completedDate: item.completedDate || '',
          description: item.description || item.desc || ''
        });
      }
    });

    return data;
  }

  function migrateLegacyStorage() {
    var legacy = legacyData();
    var writes = [];

    Object.keys(KEYS).forEach(function (name) {
      var key = KEYS[name];
      if (!store[key].length && legacy[key].length) {
        store[key] = legacy[key];
        writes.push(persist(key, store[key]));
      }
    });

    if (writes.length) Promise.all(writes).then(clearLegacyStorage).catch(function () {});
  }

  function initStorage() {
    return fetch(API_URL).then(function (res) {
      if (!res.ok) throw new Error('Database load failed');
      return res.json();
    }).then(function (data) {
      Object.keys(KEYS).forEach(function (name) {
        var key = KEYS[name];
        store[key] = Array.isArray(data[key]) ? data[key] : [];
      });
      storageReady = true;
      migrateLegacyStorage();
    });
  }

  function showDatabaseWarning(message) {
    var alert = $('#databaseAlert');
    if (!alert) {
      alert = document.createElement('div');
      alert.id = 'databaseAlert';
      alert.className = 'database-alert';
      document.body.appendChild(alert);
    }
    alert.textContent = message;
    alert.hidden = false;
  }

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

  function itemDetail(label, value) {
    if (!value) return '';
    return '<div class="item-detail">' +
      '<span class="item-detail-label">' + label + '</span>' +
      '<span class="item-detail-text">' + escHtml(value) + '</span>' +
    '</div>';
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const RECURRENCE_VALUES = ['none', 'weekly', 'monthly', 'yearly'];
  const RECURRENCE_LABELS = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

  function normalizeRecurrence(value) {
    return RECURRENCE_VALUES.indexOf(value) === -1 ? 'none' : value;
  }

  function recurrenceLabel(value) {
    return RECURRENCE_LABELS[normalizeRecurrence(value)] || '';
  }

  function eventStartTime(event) {
    return event.startTime || event.time || '';
  }

  function eventEndTime(event) {
    return event.endTime || '';
  }

  function eventSortTime(event) {
    return eventStartTime(event) || eventEndTime(event) || '';
  }

  function eventTimeRange(event) {
    var startTime = eventStartTime(event);
    var endTime = eventEndTime(event);

    if (startTime && endTime) return fmtTime12(startTime) + ' - ' + fmtTime12(endTime);
    if (startTime) return fmtTime12(startTime);
    if (endTime) return 'Ends ' + fmtTime12(endTime);
    return '';
  }

  function eventWhen(event) {
    var timeRange = eventTimeRange(event);
    return event.date + (timeRange ? ' | ' + timeRange : '');
  }

  function timeMinutes(value) {
    if (!value) return null;
    var parts = value.split(':').map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
    return parts[0] * 60 + parts[1];
  }

  function currentMinutes() {
    var now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function isEventOccurrencePast(event) {
    var today = todayStr();
    if (event.date < today) return true;
    if (event.date > today) return false;

    var compareTime = eventEndTime(event) || eventStartTime(event);
    var minutes = timeMinutes(compareTime);
    if (minutes === null) return false;
    return minutes < currentMinutes();
  }

  function parseDateValue(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;

    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return dateStr(date) === value ? date : null;
  }

  function addDays(date, days) {
    var next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function dateWithClampedDay(year, monthIndex, day) {
    var lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return new Date(year, monthIndex, Math.min(day, lastDay));
  }

  function recurrenceDate(baseDate, recurrence, index) {
    if (recurrence === 'weekly') {
      return addDays(baseDate, index * 7);
    }

    if (recurrence === 'monthly') {
      var monthIndex = baseDate.getMonth() + index;
      var year = baseDate.getFullYear() + Math.floor(monthIndex / 12);
      var month = monthIndex % 12;
      return dateWithClampedDay(year, month, baseDate.getDate());
    }

    if (recurrence === 'yearly') {
      return dateWithClampedDay(baseDate.getFullYear() + index, baseDate.getMonth(), baseDate.getDate());
    }

    return new Date(baseDate);
  }

  function eventOccurrence(event, occurrenceDate) {
    return Object.assign({}, event, {
      date: occurrenceDate,
      occurrenceId: event.id + ':' + occurrenceDate,
      recurrence: normalizeRecurrence(event.recurrence),
      sourceDate: event.date
    });
  }

  function eventOccurrencesBetween(events, startDate, endDate) {
    var occurrences = [];

    events.forEach(function (event) {
      var baseDate = parseDateValue(event.date);
      if (!baseDate) return;

      var recurrence = normalizeRecurrence(event.recurrence);
      if (recurrence === 'none') {
        if (event.date >= startDate && event.date <= endDate) {
          occurrences.push(eventOccurrence(event, event.date));
        }
        return;
      }

      var index = 0;
      var guard = 0;
      while (guard < 5000) {
        var occurrence = recurrenceDate(baseDate, recurrence, index);
        var occurrenceDate = dateStr(occurrence);
        if (occurrenceDate > endDate) break;
        if (occurrenceDate >= startDate) occurrences.push(eventOccurrence(event, occurrenceDate));
        index += 1;
        guard += 1;
      }
    });

    return occurrences;
  }

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
    var nextUp = $('#nextUp');

    eventOccurrencesBetween(events, today, dateStr(addDays(new Date(), 370))).forEach(function (e) {
      if (!isEventOccurrencePast(e)) {
        all.push({ title: e.title, date: e.date, time: eventSortTime(e), timeText: eventTimeRange(e), type: 'event' });
      }
    });

    projects.forEach(function (p) {
      if (p.completedDate) return;
      if (p.startDate && p.startDate >= today)
        all.push({ title: p.title, date: p.startDate, time: '', type: 'project' });
      if (p.endDate && p.endDate >= today)
        all.push({ title: 'Deadline: ' + p.title, date: p.endDate, time: '', type: 'project' });
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
      if (n.timeText) label += ' - ' + n.timeText;
      else if (n.time) label += ' at ' + fmtTime12(n.time);
      nextUp.textContent = label;
      nextUp.classList.add('written-text');
    } else {
      nextUp.textContent = 'Nothing scheduled';
      nextUp.classList.remove('written-text');
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
  function sessionTaskName(session) {
    var task = session.task ? String(session.task).trim() : '';
    return task || 'Untitled session';
  }

  function editSessionName(id) {
    var sessions = load(KEYS.sessions);
    var session = sessions.find(function (s) { return s.id === id; });
    if (!session) return;

    var nextTask = window.prompt('Edit session name', sessionTaskName(session));
    if (nextTask === null) return;

    nextTask = nextTask.trim();
    if (!nextTask) return;

    sessions = sessions.map(function (s) {
      if (s.id === id) return Object.assign({}, s, { task: nextTask });
      return s;
    });

    save(KEYS.sessions, sessions);
    renderSessions();
  }

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
          '<div class="session-task">' + escHtml(sessionTaskName(s)) + '</div>' +
          '<div class="session-meta">' + s.date + (s.startTime ? ' &middot; ' + fmtTime12(s.startTime) + ' - ' + fmtTime12(s.endTime) : '') + '</div>' +
        '</div>' +
        '<div class="session-actions">' +
          '<span class="session-duration">' + fmtDuration(s.duration) + '</span>' +
          '<button class="btn-delete btn-edit" data-edit-session="' + s.id + '" aria-label="Edit session name" title="Edit">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="btn-delete" data-delete-session="' + s.id + '" aria-label="Delete session" title="Delete">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  $('#sessionsList').addEventListener('click', function (e) {
    var editBtn = e.target.closest('[data-edit-session]');
    var delBtn = e.target.closest('[data-delete-session]');

    if (editBtn) {
      editSessionName(editBtn.dataset.editSession);
    } else if (delBtn) {
      var sessions = load(KEYS.sessions).filter(function (s) { return s.id !== delBtn.dataset.deleteSession; });
      save(KEYS.sessions, sessions);
      renderSessions();
      computeTotals();
    }
  });

  // ===== Events =====
  var editingEventId = null;
  var eventView = 'upcoming';

  function renderEvents() {
    var events = load(KEYS.events);
    var list = $('#eventsList');
    var title = $('#eventSectionTitle');
    var viewSelect = $('#eventView');
    var today = todayStr();
    var startDate = today;
    var endDate = dateStr(addDays(new Date(), 370));

    if (eventView === 'past') {
      title.textContent = 'Past Events';
      endDate = today;
      startDate = events.reduce(function (earliest, event) {
        if (!event.date) return earliest;
        return !earliest || event.date < earliest ? event.date : earliest;
      }, today);
    } else {
      title.textContent = 'Upcoming Events';
    }

    viewSelect.value = eventView;

    var sorted = eventOccurrencesBetween(events, startDate, endDate).filter(function (event) {
      var isPast = isEventOccurrencePast(event);
      return eventView === 'past' ? isPast : !isPast;
    }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return eventSortTime(a).localeCompare(eventSortTime(b));
    });

    if (eventView === 'past') {
      sorted.reverse();
    }

    if (!sorted.length) {
      list.innerHTML = '<p class="empty-state">' +
        (eventView === 'past' ? 'No past events yet.' : 'No upcoming events. Add one to get started.') +
      '</p>';
      return;
    }

    list.innerHTML = sorted.map(function (e) {
      var badges = [];
      var when = eventWhen(e);
      var repeat = recurrenceLabel(e.recurrence);
      var isPast = isEventOccurrencePast(e);
      if (repeat) badges.push('<span class="badge badge--recurring">' + repeat + '</span>');
      if (isPast) badges.push('<span class="badge badge--overdue">Past</span>');
      if (isToday(e.date)) badges.push('<span class="badge badge--today">Today</span>');
      else if (isTomorrow(e.date)) badges.push('<span class="badge badge--tomorrow">Tomorrow</span>');

      return '<div class="item-card" data-id="' + e.occurrenceId + '">' +
        '<div class="item-left">' +
          '<div class="item-title">' + escHtml(e.title) + '</div>' +
          itemDetail('When', when) +
          itemDetail('Location', e.location) +
          itemDetail('Notes', e.notes) +
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
    $('#eventEndTime').setCustomValidity('');

    if (id) {
      var events = load(KEYS.events);
      var e = events.find(function (ev) { return ev.id === id; });
      if (!e) return;
      $('#eventModalTitle').textContent = 'Edit Event';
      $('#eventTitle').value = e.title;
      $('#eventDate').value = e.date;
      $('#eventRecurrence').value = normalizeRecurrence(e.recurrence);
      $('#eventStartTime').value = eventStartTime(e);
      $('#eventEndTime').value = eventEndTime(e);
      $('#eventLocation').value = e.location || '';
      $('#eventNotes').value = e.notes || '';
    } else {
      $('#eventModalTitle').textContent = 'Add Event';
      form.reset();
      $('#eventDate').value = todayStr();
      $('#eventRecurrence').value = 'none';
    }

    modal.showModal();
    $('#eventTitle').focus();
  }

  function closeEventModal() {
    $('#eventModal').close();
    editingEventId = null;
  }

  $('#btnAddEvent').addEventListener('click', function () { openEventModal(); });
  $('#eventView').addEventListener('change', function (e) {
    eventView = e.target.value === 'past' ? 'past' : 'upcoming';
    renderEvents();
  });
  $('#eventCancel').addEventListener('click', closeEventModal);
  $('#eventModal').addEventListener('close', function () { editingEventId = null; });

  $('#eventForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('#eventTitle').value.trim();
    var date = $('#eventDate').value;
    var recurrence = normalizeRecurrence($('#eventRecurrence').value);
    var startTime = $('#eventStartTime').value;
    var endTime = $('#eventEndTime').value;
    var location = $('#eventLocation').value.trim();
    var notes = $('#eventNotes').value.trim();
    var endTimeInput = $('#eventEndTime');

    if (!title || !date) return;
    endTimeInput.setCustomValidity('');

    if (startTime && endTime && endTime <= startTime) {
      endTimeInput.setCustomValidity('End time must be after start time.');
      endTimeInput.reportValidity();
      return;
    }

    var events = load(KEYS.events);
    var eventData = {
      title: title,
      date: date,
      startTime: startTime,
      endTime: endTime,
      time: startTime,
      recurrence: recurrence,
      location: location,
      notes: notes
    };

    if (editingEventId) {
      events = events.map(function (ev) {
        if (ev.id === editingEventId) {
          return Object.assign({}, ev, eventData);
        }
        return ev;
      });
    } else {
      events.push(Object.assign({ id: uid() }, eventData));
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
    if (p.completedDate) return 'completed';
    return 'in-progress';
  }

  function isProjectOverdue(p) {
    if (!p.endDate || p.completedDate) return false;
    return p.endDate < todayStr();
  }

  function projectDateLine(p) {
    var parts = [];
    if (p.startDate) parts.push('Start: ' + escHtml(p.startDate));
    if (p.endDate) parts.push('Deadline: ' + escHtml(p.endDate));
    if (p.completedDate) parts.push('Completed: ' + escHtml(p.completedDate));
    return parts.join(' &middot; ');
  }

  function projectCalendarMeta(p, selectedDate) {
    var parts = [];
    if (p.startDate === selectedDate) parts.push('Start: ' + escHtml(p.startDate));
    if (p.endDate === selectedDate) parts.push('Deadline: ' + escHtml(p.endDate));
    if (p.completedDate === selectedDate) parts.push('Completed: ' + escHtml(p.completedDate));
    return parts.join(' &middot; ') || projectDateLine(p);
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
      if (!p.completedDate && isToday(p.endDate)) badges.push('<span class="badge badge--today">Due Today</span>');
      else if (!p.completedDate && isTomorrow(p.endDate)) badges.push('<span class="badge badge--tomorrow">Due Tomorrow</span>');
      else if (isToday(p.startDate)) badges.push('<span class="badge badge--today">Starts Today</span>');
      else if (isTomorrow(p.startDate)) badges.push('<span class="badge badge--tomorrow">Starts Tomorrow</span>');

      var dateLine = projectDateLine(p);

      return '<div class="item-card" data-id="' + p.id + '">' +
        '<div class="item-left">' +
          '<div class="item-title">' + escHtml(p.title) + '</div>' +
          '<div class="item-sub">' + dateLine + '</div>' +
          (p.description ? '<div class="item-sub item-note">' + escHtml(p.description) + '</div>' : '') +
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
      $('#projectCompletedDate').value = p.completedDate || '';
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
    var completedDate = $('#projectCompletedDate').value;
    var description = $('#projectDesc').value.trim();

    if (!title || !startDate) return;

    var items = load(KEYS.projects);

    if (editingProjectId) {
      items = items.map(function (p) {
        if (p.id === editingProjectId) {
          return Object.assign({}, p, {
            title: title,
            startDate: startDate,
            endDate: endDate,
            completedDate: completedDate,
            description: description
          });
        }
        return p;
      });
    } else {
      items.push({
        id: uid(),
        title: title,
        startDate: startDate,
        endDate: endDate,
        completedDate: completedDate,
        description: description
      });
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
      var when = m.date + (m.time ? ' at ' + fmtTime12(m.time) : '');
      var notes = m.notes || m.description || '';
      badges.push('<span class="badge badge--meeting">Meeting</span>');
      var isPast = m.date < todayStr();
      if (isPast) badges.push('<span class="badge badge--overdue">Past</span>');
      if (isToday(m.date)) badges.push('<span class="badge badge--today">Today</span>');
      else if (isTomorrow(m.date)) badges.push('<span class="badge badge--tomorrow">Tomorrow</span>');

      return '<div class="item-card" data-id="' + m.id + '">' +
        '<div class="item-left">' +
          '<div class="item-title">' + escHtml(m.title) + '</div>' +
          itemDetail('When', when) +
          itemDetail('Location', m.location) +
          itemDetail('Notes', notes) +
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
      $('#meetingLocation').value = m.location || '';
      $('#meetingDesc').value = m.notes || m.description || '';
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
    var location = $('#meetingLocation').value.trim();
    var notes = $('#meetingDesc').value.trim();

    if (!title || !date) return;

    var items = load(KEYS.meetings);

    if (editingMeetingId) {
      items = items.map(function (m) {
        if (m.id === editingMeetingId) {
          return Object.assign({}, m, { title: title, date: date, time: time, location: location, notes: notes, description: notes });
        }
        return m;
      });
    } else {
      items.push({ id: uid(), title: title, date: date, time: time, location: location, notes: notes, description: notes });
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
    var monthStart = calYear + '-' + pad(calMonth + 1) + '-01';
    var monthEnd = calYear + '-' + pad(calMonth + 1) + '-' + pad(daysInMonth);

    // Compute marked dates from all sources
    var marked = {};
    eventOccurrencesBetween(load(KEYS.events), monthStart, monthEnd).forEach(function (e) { marked[e.date] = (marked[e.date] || 0) + 1; });
    load(KEYS.projects).forEach(function (p) {
      if (p.startDate) marked[p.startDate] = (marked[p.startDate] || 0) + 1;
      if (p.endDate) marked[p.endDate] = (marked[p.endDate] || 0) + 1;
      if (p.completedDate) marked[p.completedDate] = (marked[p.completedDate] || 0) + 1;
    });
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
      container.classList.remove('calendar-day-items--scroll');
      container.innerHTML = '<p class="empty-state">Select a marked day to see items.</p>';
      return;
    }

    var dateFilter = calSelectedDate;
    var evItems = eventOccurrencesBetween(load(KEYS.events), dateFilter, dateFilter);
    var projItems = load(KEYS.projects).filter(function (p) {
      return p.startDate === dateFilter || p.endDate === dateFilter || p.completedDate === dateFilter;
    });
    var meetItems = load(KEYS.meetings).filter(function (m) { return m.date === dateFilter; });
    var totalItems = evItems.length + projItems.length + meetItems.length;

    if (!evItems.length && !projItems.length && !meetItems.length) {
      container.classList.remove('calendar-day-items--scroll');
      container.innerHTML = '<p class="empty-state">No items on this date.</p>';
      return;
    }

    container.classList.toggle('calendar-day-items--scroll', totalItems > 3);

    var html = '';

    evItems.forEach(function (e) {
      var eventMeta = '';
      var timeRange = eventTimeRange(e);
      var repeat = recurrenceLabel(e.recurrence);
      if (timeRange) eventMeta = timeRange;
      if (e.location) eventMeta += (eventMeta ? ' &middot; ' : '') + '<span class="item-written">' + escHtml(e.location) + '</span>';
      if (repeat) eventMeta += (eventMeta ? ' &middot; ' : '') + repeat;

      html += '<div class="cal-item">' +
        '<span class="cal-item-dot cal-item-dot--event"></span>' +
        '<div class="cal-item-info">' +
          '<div class="cal-item-title">' + escHtml(e.title) + '</div>' +
          (eventMeta ? '<div class="cal-item-time">' + eventMeta + '</div>' : '') +
          (e.notes ? '<div class="cal-item-time item-note">' + escHtml(e.notes) + '</div>' : '') +
        '</div>' +
      '</div>';
    });

    projItems.forEach(function (p) {
      html += '<div class="cal-item">' +
        '<span class="cal-item-dot cal-item-dot--project"></span>' +
        '<div class="cal-item-info">' +
          '<div class="cal-item-title">' + escHtml(p.title) + '</div>' +
          '<div class="cal-item-time">' + projectCalendarMeta(p, dateFilter) + '</div>' +
        '</div>' +
      '</div>';
    });

    meetItems.forEach(function (m) {
      var meetingMeta = '';
      var notes = m.notes || m.description || '';
      if (m.time) meetingMeta = fmtTime12(m.time);
      if (m.location) meetingMeta += (meetingMeta ? ' &middot; ' : '') + '<span class="item-written">' + escHtml(m.location) + '</span>';

      html += '<div class="cal-item">' +
        '<span class="cal-item-dot cal-item-dot--meeting"></span>' +
        '<div class="cal-item-info">' +
          '<div class="cal-item-title">' + escHtml(m.title) + '</div>' +
          (meetingMeta ? '<div class="cal-item-time">' + meetingMeta + '</div>' : '') +
          (notes ? '<div class="cal-item-time item-note">' + escHtml(notes) + '</div>' : '') +
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
  function renderApp() {
    renderSessions();
    renderEvents();
    renderProjects();
    renderMeetings();
    renderCalendar();
    computeTotals();
    computeNextUp();
  }

  function init() {
    updateClock();
    updateDate();
    setInterval(updateClock, 1000);
    setInterval(updateDate, 60000);

    setTimerButtons('idle');
    initCalendar();

    initStorage().then(renderApp).catch(function (err) {
      showDatabaseWarning('Database unavailable. Run the Node server and check your MongoDB URI.');
      console.error(err);
      renderApp();
    });
  }

  init();
})();
