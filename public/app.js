const app = document.getElementById('app');
const socket = io();

let state = null;
let serverOffset = 0;
let role = 'home';
let roomId = 'main';
let copyMessage = '';
let panitiaNotice = '';
let clockTimer = null;

const pathParts = window.location.pathname.split('/').filter(Boolean);
if (['control', 'stage', 'panitia', 'speaker'].includes(pathParts[0])) {
  role = pathParts[0] === 'control' ? 'operator' : pathParts[0];
  if (role === 'speaker') role = 'panitia';
  roomId = cleanRoom(pathParts[1] || 'main');
} else {
  const query = new URLSearchParams(window.location.search);
  roomId = cleanRoom(query.get('room') || localStorage.getItem('showtimer:lastRoom') || 'main');
}

if (role !== 'home') {
  socket.emit('room:join', { roomId, role });
}

socket.on('room:state', (nextState) => {
  state = nextState;
  serverOffset = nextState.serverNow - Date.now();
  localStorage.setItem('showtimer:lastRoom', state.roomId);
  render();
});

function cleanRoom(value) {
  return String(value || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'main';
}

function action(type, payload = {}) {
  socket.emit('room:action', { type, ...payload });
}

function serverNow() {
  return Date.now() + serverOffset;
}

function rawRemainingMs() {
  if (!state) return 0;
  return state.timer.running && state.timer.endAt
    ? state.timer.endAt - serverNow()
    : state.timer.remainingMs;
}

function remainingMs() {
  const rawRemaining = rawRemainingMs();
  return state.settings.allowOverrun ? rawRemaining : Math.max(0, rawRemaining);
}

function activeItem() {
  if (!state) return null;
  return state.items[state.activeIndex] || state.items[0] || null;
}

function nextItem() {
  if (!state) return null;
  return state.items[state.activeIndex + 1] || null;
}

function timerClass(ms) {
  if (!state) return '';
  if (ms < 0) return 'over';
  if (ms <= state.settings.dangerAtMs) return 'danger';
  if (ms <= state.settings.warnAtMs) return 'warn';
  return '';
}

function formatTime(ms) {
  const sign = ms < 0 ? '+' : '';
  const absolute = Math.abs(Math.round(ms / 1000));
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  if (hours > 0) {
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDisplayTime(rawMs) {
  if (role === 'operator' || role === 'panitia') return formatTime(rawMs);
  if (role === 'stage' && rawMs < 0) return 'WAKTU HABIS!';
  return formatTime(Math.max(0, rawMs));
}

function timerClassForRole(rawMs) {
  const className = timerClass(rawMs);
  if (role === 'stage' && rawMs < 0) return `${className} time-ended`;
  return className;
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function parseDurationToMs(value) {
  const text = String(value || '').trim();
  if (!text) return 5 * 60 * 1000;
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) return 5 * 60 * 1000;
    if (parts.length === 3) return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
    return ((parts[0] * 60) + parts[1]) * 1000;
  }
  return Math.max(1, Number(text)) * 60 * 1000;
}

function durationInputValue(ms) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}:${String(seconds).padStart(2, '0')}` : String(minutes);
}

function progressPercent() {
  if (!state) return 0;
  const itemDuration = Math.max(1, state.timer.durationMs);
  const remain = remainingMs();
  const elapsed = Math.min(itemDuration, Math.max(0, itemDuration - remain));
  return Math.round((elapsed / itemDuration) * 100);
}

function currentClock() {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
}

function formatMessageTime(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function roleUrl(nextRole) {
  const pathRole = nextRole === 'operator' ? 'control' : nextRole;
  return `${window.location.origin}/${pathRole}/${state ? state.roomId : roomId}`;
}

function copy(text) {
  navigator.clipboard.writeText(text).then(() => {
    copyMessage = 'Link disalin.';
    render();
    setTimeout(() => {
      copyMessage = '';
      render();
    }, 1400);
  }).catch(() => {
    copyMessage = 'Salin manual dari kolom link.';
    render();
  });
}

function startRoom(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const nextRoom = cleanRoom(form.get('room') || 'main');
  const eventName = String(form.get('eventName') || '').trim();
  localStorage.setItem('showtimer:lastRoom', nextRoom);
  localStorage.setItem(`showtimer:eventName:${nextRoom}`, eventName);
  window.location.href = `/control/${nextRoom}`;
}

function render() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }

  if (role === 'home') {
    renderHome();
    return;
  }

  if (!state) {
    app.innerHTML = '<div class="home"><div class="home-panel">Menghubungkan ke ShowTimer...</div></div>';
    return;
  }

  if (role === 'operator') renderOperator();
  if (role === 'stage') renderStage();
  if (role === 'panitia') renderPanitia();

  clockTimer = setInterval(tick, 250);
}

function tick() {
  const rawMs = rawRemainingMs();
  document.querySelectorAll('[data-time]').forEach((element) => {
    element.textContent = formatDisplayTime(rawMs);
    element.className = element.dataset.baseClass + ' ' + timerClassForRole(rawMs);
  });
  document.querySelectorAll('[data-progress]').forEach((element) => {
    element.style.width = `${progressPercent()}%`;
  });
  document.querySelectorAll('[data-clock]').forEach((element) => {
    element.textContent = currentClock();
  });
}

function renderHome() {
  const savedEventName = localStorage.getItem(`showtimer:eventName:${roomId}`) || 'ShowTimer Event';
  app.innerHTML = `
    <section class="home">
      <div class="home-panel">
        <div class="brand">
          <div class="brand-mark">ST</div>
          <div>
            <h1>ShowTimer</h1>
            <p>Timer acara real-time untuk operator, layar panggung fullscreen, dan panitia pendamping.</p>
          </div>
        </div>
        <form class="home-form" data-start-room>
          <label class="field">
            <span>Nama acara</span>
            <input class="input" name="eventName" value="${escapeHtml(savedEventName)}" autocomplete="off">
          </label>
          <label class="field">
            <span>Kode room</span>
            <input class="input" name="room" value="${escapeHtml(roomId)}" autocomplete="off">
          </label>
          <button class="button primary wide" type="submit">Buka Kontrol Operator</button>
        </form>
      </div>
    </section>
  `;
  app.querySelector('[data-start-room]').addEventListener('submit', startRoom);
}

function renderOperator() {
  const item = activeItem();
  const rawMs = rawRemainingMs();
  const stageLink = roleUrl('stage');
  const panitiaLink = roleUrl('panitia');
  const operatorLink = roleUrl('operator');
  const savedEventName = localStorage.getItem(`showtimer:eventName:${state.roomId}`);
  if (savedEventName && state.eventName === 'ShowTimer Event') {
    action('meta:update', { eventName: savedEventName });
  }

  app.innerHTML = `
    <section class="operator">
      <header class="topbar">
        <div class="topbar-left">
          <div class="brand-mark">ST</div>
          <input class="event-name-input" value="${escapeHtml(state.eventName)}" aria-label="Nama acara" data-event-name>
          <span class="status-pill ${state.timer.running ? 'live' : ''}">${state.timer.running ? 'RUNNING' : 'PAUSED'}</span>
        </div>
        <div class="topbar-right">
          <a class="button small ghost" href="${stageLink}" target="_blank" rel="noreferrer">Stage</a>
          <a class="button small ghost" href="${panitiaLink}" target="_blank" rel="noreferrer">Panitia</a>
          <button class="button small" data-copy="${operatorLink}">Copy Operator</button>
        </div>
      </header>

      <div class="operator-grid">
        <section class="panel">
          <div class="panel-header">
            <h2 class="panel-title">Rundown</h2>
            <button class="button small primary" data-add-item>Tambah</button>
          </div>
          <div class="rundown-list">
            ${state.items.map((nextItem, index) => rundownRow(nextItem, index)).join('')}
          </div>
        </section>

        <section class="timer-panel">
          <div class="timer-display">
            <div>
              <div class="timer-number ${timerClassForRole(rawMs)}" data-time data-base-class="timer-number">${formatDisplayTime(rawMs)}</div>
              <div class="timer-caption">${rawMs < 0 ? 'Overtime' : 'Sisa waktu'}</div>
              <h2 class="current-title">${escapeHtml(item.title)}</h2>
              <div class="current-speaker">${escapeHtml(item.speaker || 'Tanpa nama speaker')}</div>
              <div class="progress"><span data-progress style="width: ${progressPercent()}%"></span></div>
            </div>
          </div>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Kontrol Timer</h2>
              <div class="button-row">
                <button class="button small" data-action="rundown:previous">Prev</button>
                <button class="button small" data-action="rundown:next">Next</button>
              </div>
            </div>
            <div class="panel-body">
              <div class="control-grid">
                <button class="button primary" data-action="${state.timer.running ? 'timer:pause' : 'timer:start'}">${state.timer.running ? 'Pause' : 'Start'}</button>
                <button class="button" data-action="timer:reset">Reset</button>
                <button class="button" data-add-ms="60000">+1m</button>
                <button class="button" data-add-ms="-60000">-1m</button>
                <button class="button" data-add-ms="30000">+30s</button>
                <button class="button" data-add-ms="-30000">-30s</button>
                <button class="button" data-set-ms="300000">Set 5m</button>
                <button class="button danger" data-set-ms="0">Set 00:00</button>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Edit Sesi Aktif</h2>
            </div>
            <div class="panel-body">
              <form class="editor-grid" data-edit-active>
                <label class="field">
                  <span>Judul</span>
                  <input class="input" name="title" value="${escapeHtml(item.title)}">
                </label>
                <label class="field">
                  <span>Speaker</span>
                  <input class="input" name="speaker" value="${escapeHtml(item.speaker)}">
                </label>
                <label class="field">
                  <span>Durasi (menit atau mm:ss)</span>
                  <input class="input" name="duration" value="${escapeHtml(durationInputValue(item.durationMs))}">
                </label>
                <label class="field">
                  <span>Index aktif</span>
                  <select class="select" name="activeIndex">
                    ${state.items.map((rowItem, index) => `<option value="${index}" ${index === state.activeIndex ? 'selected' : ''}>${index + 1}. ${escapeHtml(rowItem.title)}</option>`).join('')}
                  </select>
                </label>
                <label class="field span-2">
                  <span>Catatan speaker</span>
                  <textarea class="textarea" name="notes">${escapeHtml(item.notes)}</textarea>
                </label>
                <button class="button primary span-2" type="submit">Simpan Sesi</button>
              </form>
            </div>
          </section>
        </section>

        <aside class="panel">
          <div class="panel-header">
            <h2 class="panel-title">Link & Pengaturan</h2>
          </div>
          <div class="panel-body link-list">
            ${linkItem('Operator', operatorLink)}
            ${linkItem('Layar Panggung', stageLink)}
            ${linkItem('Panitia Non Operator', panitiaLink)}
            <div class="copy-note">${copyMessage}</div>
          </div>
          <div class="panel-header">
            <h2 class="panel-title">Pesan ke Layar</h2>
          </div>
          <div class="panel-body message-list">
            <textarea class="textarea" placeholder="Contoh: Wrap up, 2 menit lagi" data-message>${escapeHtml(state.message)}</textarea>
            <button class="button blue" data-save-message>Kirim Pesan</button>
            <button class="button ghost" data-clear-message>Kosongkan Pesan</button>
          </div>
          <div class="panel-header">
            <h2 class="panel-title">Pesan dari Panitia</h2>
            <button class="button small ghost" data-clear-panitia-messages>Bersihkan</button>
          </div>
          <div class="panel-body">
            ${panitiaMessageList()}
          </div>
          <div class="panel-header">
            <h2 class="panel-title">Mode Tampilan</h2>
          </div>
          <div class="panel-body settings-list">
            ${settingCheckbox('showNext', 'Tampilkan sesi berikutnya')}
            ${settingCheckbox('showMessage', 'Tampilkan pesan operator')}
            ${settingCheckbox('allowOverrun', 'Hitung overtime setelah nol')}
            ${settingCheckbox('stageClock', 'Tampilkan jam di stage')}
            <label class="field">
              <span>Warning pada detik</span>
              <input class="input" type="number" min="0" value="${Math.round(state.settings.warnAtMs / 1000)}" data-setting-number="warnAtMs">
            </label>
            <label class="field">
              <span>Danger pada detik</span>
              <input class="input" type="number" min="0" value="${Math.round(state.settings.dangerAtMs / 1000)}" data-setting-number="dangerAtMs">
            </label>
          </div>
        </aside>
      </div>
    </section>
  `;

  bindOperator();
}

function rundownRow(item, index) {
  return `
    <div class="rundown-row ${index === state.activeIndex ? 'active' : ''}">
      <button class="rundown-index" data-set-active="${index}">${index + 1}</button>
      <div class="rundown-main">
        <div class="rundown-title">${escapeHtml(item.title)}</div>
        <div class="rundown-meta">
          <span>${escapeHtml(formatDuration(item.durationMs))}</span>
          <span>${escapeHtml(item.speaker || 'Speaker kosong')}</span>
        </div>
      </div>
      <div class="rundown-actions">
        <button class="button small" data-move="${item.id}" data-direction="-1">Up</button>
        <button class="button small" data-move="${item.id}" data-direction="1">Down</button>
        <button class="button small danger" data-delete="${item.id}">Del</button>
      </div>
    </div>
  `;
}

function linkItem(label, url) {
  return `
    <div class="link-item">
      <span class="small-label">${label}</span>
      <div class="link-line">
        <input class="input" value="${escapeHtml(url)}" readonly>
        <button class="button small" data-copy="${url}">Copy</button>
      </div>
    </div>
  `;
}

function settingCheckbox(key, label) {
  return `
    <label class="button-row">
      <input type="checkbox" data-setting="${key}" ${state.settings[key] ? 'checked' : ''}>
      <span>${label}</span>
    </label>
  `;
}

function panitiaMessageList() {
  if (!state.panitiaMessages || state.panitiaMessages.length === 0) {
    return '<div class="empty compact">Belum ada pesan dari panitia.</div>';
  }

  return `
    <div class="panitia-inbox">
      ${[...state.panitiaMessages].reverse().map((message) => `
        <div class="panitia-message">
          <div class="panitia-message-meta">
            <strong>${escapeHtml(message.sender)}</strong>
            <span>${escapeHtml(formatMessageTime(message.createdAt))}</span>
          </div>
          <p>${escapeHtml(message.text)}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function panitiaRundownList() {
  return `
    <div class="panitia-rundown">
      ${state.items.map((item, index) => `
        <button class="panitia-rundown-item ${index === state.activeIndex ? 'active' : ''}" type="button">
          <span class="panitia-rundown-index">${index + 1}</span>
          <span class="panitia-rundown-main">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(formatDuration(item.durationMs))}${item.speaker ? ` - ${escapeHtml(item.speaker)}` : ''}</span>
          </span>
        </button>
      `).join('')}
    </div>
  `;
}

function bindOperator() {
  app.querySelector('[data-event-name]').addEventListener('change', (event) => {
    localStorage.setItem(`showtimer:eventName:${state.roomId}`, event.currentTarget.value);
    action('meta:update', { eventName: event.currentTarget.value });
  });

  app.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => action(button.dataset.action));
  });

  app.querySelectorAll('[data-add-ms]').forEach((button) => {
    button.addEventListener('click', () => action('timer:add', { deltaMs: Number(button.dataset.addMs) }));
  });

  app.querySelectorAll('[data-set-ms]').forEach((button) => {
    button.addEventListener('click', () => action('timer:set', { remainingMs: Number(button.dataset.setMs) }));
  });

  app.querySelectorAll('[data-set-active]').forEach((button) => {
    button.addEventListener('click', () => action('rundown:setActive', { index: Number(button.dataset.setActive) }));
  });

  app.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', () => action('rundown:delete', { id: button.dataset.delete }));
  });

  app.querySelectorAll('[data-move]').forEach((button) => {
    button.addEventListener('click', () => {
      const currentIndex = state.items.findIndex((item) => item.id === button.dataset.move);
      action('rundown:move', { id: button.dataset.move, toIndex: currentIndex + Number(button.dataset.direction) });
    });
  });

  app.querySelector('[data-add-item]').addEventListener('click', () => {
    action('rundown:add', {
      item: {
        title: 'Sesi Baru',
        speaker: '',
        durationMs: 5 * 60 * 1000,
        notes: ''
      }
    });
  });

  app.querySelector('[data-edit-active]').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextIndex = Number(form.get('activeIndex'));
    const item = activeItem();
    action('rundown:update', {
      id: item.id,
      patch: {
        title: form.get('title'),
        speaker: form.get('speaker'),
        durationMs: parseDurationToMs(form.get('duration')),
        notes: form.get('notes')
      }
    });
    if (nextIndex !== state.activeIndex) action('rundown:setActive', { index: nextIndex });
  });

  app.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => copy(button.dataset.copy));
  });

  app.querySelector('[data-save-message]').addEventListener('click', () => {
    action('message:set', { message: app.querySelector('[data-message]').value });
  });

  app.querySelector('[data-clear-message]').addEventListener('click', () => {
    action('message:set', { message: '' });
  });

  const clearPanitiaButton = app.querySelector('[data-clear-panitia-messages]');
  if (clearPanitiaButton) {
    clearPanitiaButton.addEventListener('click', () => {
      action('panitiaMessage:clear');
    });
  }

  app.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('change', () => {
      action('settings:update', { settings: { [input.dataset.setting]: input.checked } });
    });
  });

  app.querySelectorAll('[data-setting-number]').forEach((input) => {
    input.addEventListener('change', () => {
      action('settings:update', { settings: { [input.dataset.settingNumber]: Number(input.value) * 1000 } });
    });
  });
}

function renderStage() {
  const item = activeItem();
  const next = nextItem();
  const rawMs = rawRemainingMs();
  app.innerHTML = `
    <section class="stage">
      <button class="button small fullscreen-fab" data-fullscreen>Fullscreen</button>
      <header class="stage-top">
        <div class="stage-kicker">${escapeHtml(state.eventName)}</div>
        ${state.settings.stageClock ? '<div class="stage-clock" data-clock>' + currentClock() + '</div>' : '<div></div>'}
      </header>
      <div class="stage-center">
        <div>
          <div class="stage-time ${timerClassForRole(rawMs)}" data-time data-base-class="stage-time">${formatDisplayTime(rawMs)}</div>
          <h1 class="stage-title">${escapeHtml(item.title)}</h1>
          <div class="stage-speaker">${escapeHtml(item.speaker || '')}</div>
        </div>
      </div>
      <footer class="stage-bottom">
        <div class="stage-message">${state.settings.showMessage && state.message ? escapeHtml(state.message) : ''}</div>
        <div class="stage-next">${state.settings.showNext && next ? `Berikutnya: ${escapeHtml(next.title)}` : ''}</div>
      </footer>
    </section>
  `;
  bindFullscreen();
}

function renderPanitia() {
  const item = activeItem();
  const rawMs = rawRemainingMs();
  const sender = localStorage.getItem('showtimer:panitiaSender') || 'Panitia';
  app.innerHTML = `
    <section class="speaker">
      <button class="button small fullscreen-fab" data-fullscreen>Fullscreen</button>
      <div class="speaker-main">
        <div class="speaker-kicker">${escapeHtml(state.eventName)} - Panitia</div>
        <div class="speaker-time ${timerClassForRole(rawMs)}" data-time data-base-class="speaker-time">${formatDisplayTime(rawMs)}</div>
        <div class="progress"><span data-progress style="width: ${progressPercent()}%"></span></div>
        <h1 class="speaker-title">${escapeHtml(item.title)}</h1>
        <div class="speaker-name">${escapeHtml(item.speaker || '')}</div>
      </div>
      <aside class="speaker-side">
        <div class="speaker-box">
          <h2>Pesan ke Operator</h2>
          <form class="panitia-message-form" data-panitia-message-form>
            <input class="input" name="sender" value="${escapeHtml(sender)}" placeholder="Nama panitia">
            <textarea class="textarea" name="text" placeholder="Tulis pesan untuk operator..."></textarea>
            <button class="button primary" type="submit">Kirim ke Operator</button>
            <div class="copy-note">${escapeHtml(panitiaNotice)}</div>
          </form>
        </div>
        <div class="speaker-box">
          <h2>Rundown Acara</h2>
          ${panitiaRundownList()}
        </div>
        <div class="speaker-box">
          <h2>Catatan Sesi Aktif</h2>
          <p>${escapeHtml(item.notes || 'Tidak ada catatan untuk sesi ini.')}</p>
        </div>
        <div class="speaker-box">
          <h2>Pesan Operator</h2>
          <p>${state.settings.showMessage && state.message ? escapeHtml(state.message) : 'Tidak ada pesan.'}</p>
        </div>
      </aside>
    </section>
  `;
  bindFullscreen();
  bindPanitia();
}

function bindPanitia() {
  const form = app.querySelector('[data-panitia-message-form]');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const sender = String(formData.get('sender') || 'Panitia').trim() || 'Panitia';
    const text = String(formData.get('text') || '').trim();
    localStorage.setItem('showtimer:panitiaSender', sender);
    if (!text) return;
    action('panitiaMessage:add', { sender, text });
    panitiaNotice = 'Pesan terkirim ke operator.';
    form.reset();
    form.elements.sender.value = sender;
    setTimeout(() => {
      panitiaNotice = '';
      render();
    }, 1600);
  });
}

function bindFullscreen() {
  const button = app.querySelector('[data-fullscreen]');
  if (!button) return;
  button.addEventListener('click', () => {
    const target = document.documentElement;
    if (!document.fullscreenElement) {
      target.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });
}

render();
