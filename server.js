const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');

const rooms = new Map();

const DEFAULT_ITEMS = [
  {
    id: makeId(),
    title: 'Opening',
    speaker: 'MC',
    durationMs: 5 * 60 * 1000,
    notes: 'Sapa audiens, housekeeping, dan pembukaan singkat.'
  },
  {
    id: makeId(),
    title: 'Keynote',
    speaker: 'Pembicara Utama',
    durationMs: 20 * 60 * 1000,
    notes: 'Materi utama acara.'
  },
  {
    id: makeId(),
    title: 'Q&A',
    speaker: 'Moderator',
    durationMs: 10 * 60 * 1000,
    notes: 'Ambil pertanyaan dari audiens dan tutup sesi.'
  }
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function now() {
  return Date.now();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hostNameFromHeader(hostHeader) {
  return String(hostHeader || '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(':')[0]
    .toLowerCase();
}

function isTrustedLocalHost(hostHeader) {
  const hostname = hostNameFromHeader(hostHeader);
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.startsWith('10.')
    || hostname.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function publicRoomFromPath(pathname) {
  const match = String(pathname || '').match(/^\/(?:control|stage|panitia|speaker)\/([^/?#]+)/i);
  return match ? match[1] : 'main';
}

function publicPathAllowed(pathname) {
  const cleanPath = String(pathname || '').toLowerCase();
  return cleanPath === '/index.html'
    || cleanPath === '/app.js'
    || cleanPath === '/styles.css'
    || cleanPath === '/favicon.ico'
    || cleanPath.startsWith('/panitia/')
    || cleanPath.startsWith('/speaker/')
    || cleanPath.startsWith('/api/rooms/')
    || cleanPath === '/api/health';
}

function normalizeRole(role) {
  const cleanRole = String(role || '').toLowerCase();
  if (cleanRole === 'operator') return 'operator';
  if (cleanRole === 'stage') return 'stage';
  return 'panitia';
}

function roleCanApplyAction(role, type) {
  if (role === 'operator') return true;
  if (role === 'panitia') return type === 'panitiaMessage:add';
  return false;
}

function createRoom(roomId) {
  const firstDuration = DEFAULT_ITEMS[0].durationMs;
  return {
    roomId,
    eventName: 'ShowTimer Event',
    activeIndex: 0,
    items: clone(DEFAULT_ITEMS),
    timer: {
      running: false,
      durationMs: firstDuration,
      remainingMs: firstDuration,
      endAt: null
    },
    message: '',
    panitiaMessages: [],
    settings: {
      warnAtMs: 60 * 1000,
      dangerAtMs: 10 * 1000,
      showNext: true,
      showMessage: true,
      allowOverrun: true,
      stageClock: true
    },
    updatedAt: now()
  };
}

function loadRooms() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([roomId, state]) => {
      rooms.set(roomId, normalizeRoom(roomId, state));
    });
  } catch (error) {
    console.warn('Could not load saved rooms:', error.message);
  }
}

function saveRooms() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const serializable = {};
    rooms.forEach((state, roomId) => {
      serializable[roomId] = state;
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(serializable, null, 2));
  } catch (error) {
    console.warn('Could not save rooms:', error.message);
  }
}

function normalizeRoom(roomId, state) {
  const room = {
    ...createRoom(roomId),
    ...state,
    roomId
  };

  room.items = Array.isArray(state.items) && state.items.length > 0
    ? state.items.map(normalizeItem)
    : clone(DEFAULT_ITEMS);
  room.activeIndex = clampNumber(state.activeIndex, 0, 0, room.items.length - 1);
  room.settings = { ...createRoom(roomId).settings, ...(state.settings || {}) };
  room.panitiaMessages = Array.isArray(state.panitiaMessages)
    ? state.panitiaMessages.map(normalizePanitiaMessage).filter(Boolean).slice(-40)
    : [];
  room.timer = { ...createRoom(roomId).timer, ...(state.timer || {}) };

  const activeItem = room.items[room.activeIndex] || room.items[0];
  room.timer.durationMs = clampNumber(room.timer.durationMs, activeItem.durationMs, 1000, 24 * 60 * 60 * 1000);
  room.timer.remainingMs = clampNumber(room.timer.remainingMs, activeItem.durationMs, -24 * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
  room.timer.running = Boolean(room.timer.running);
  room.timer.endAt = room.timer.running ? Number(room.timer.endAt) || now() + room.timer.remainingMs : null;
  return room;
}

function normalizeItem(item) {
  return {
    id: String(item.id || makeId()),
    title: String(item.title || 'Untitled'),
    speaker: String(item.speaker || ''),
    durationMs: clampNumber(item.durationMs, 5 * 60 * 1000, 1000, 24 * 60 * 60 * 1000),
    notes: String(item.notes || '')
  };
}

function normalizePanitiaMessage(message) {
  const text = String(message.text || '').trim().slice(0, 400);
  if (!text) return null;
  return {
    id: String(message.id || makeId()),
    sender: String(message.sender || 'Panitia').trim().slice(0, 80) || 'Panitia',
    text,
    createdAt: Number(message.createdAt) || now()
  };
}

function getRoom(roomId) {
  const cleanRoomId = String(roomId || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'main';
  if (!rooms.has(cleanRoomId)) {
    rooms.set(cleanRoomId, createRoom(cleanRoomId));
    saveRooms();
  }
  return rooms.get(cleanRoomId);
}

function activeItem(state) {
  return state.items[state.activeIndex] || state.items[0];
}

function currentRemaining(state) {
  if (!state.timer.running || !state.timer.endAt) return state.timer.remainingMs;
  return state.timer.endAt - now();
}

function hydrateForClient(state) {
  return {
    ...clone(state),
    timer: {
      ...state.timer,
      remainingMs: currentRemaining(state)
    },
    serverNow: now()
  };
}

function markChanged(state) {
  state.updatedAt = now();
  saveRooms();
}

function broadcast(roomId) {
  const state = getRoom(roomId);
  io.to(roomId).emit('room:state', hydrateForClient(state));
}

function setActive(state, index) {
  const nextIndex = clampNumber(index, state.activeIndex, 0, state.items.length - 1);
  const item = state.items[nextIndex];
  state.activeIndex = nextIndex;
  state.timer.running = false;
  state.timer.durationMs = item.durationMs;
  state.timer.remainingMs = item.durationMs;
  state.timer.endAt = null;
}

function applyAction(roomId, action, role = 'operator') {
  const state = getRoom(roomId);
  const type = action && action.type;

  if (!roleCanApplyAction(role, type)) return;

  switch (type) {
    case 'meta:update': {
      state.eventName = String(action.eventName || 'ShowTimer Event').slice(0, 120);
      break;
    }

    case 'timer:start': {
      if (!state.timer.running) {
        const remaining = currentRemaining(state);
        state.timer.running = true;
        state.timer.remainingMs = remaining;
        state.timer.endAt = now() + remaining;
      }
      break;
    }

    case 'timer:pause': {
      state.timer.remainingMs = currentRemaining(state);
      state.timer.running = false;
      state.timer.endAt = null;
      break;
    }

    case 'timer:reset': {
      const item = activeItem(state);
      state.timer.running = false;
      state.timer.durationMs = item.durationMs;
      state.timer.remainingMs = item.durationMs;
      state.timer.endAt = null;
      break;
    }

    case 'timer:add': {
      const nextRemaining = currentRemaining(state) + clampNumber(action.deltaMs, 0, -12 * 60 * 60 * 1000, 12 * 60 * 60 * 1000);
      state.timer.remainingMs = nextRemaining;
      if (state.timer.running) state.timer.endAt = now() + nextRemaining;
      break;
    }

    case 'timer:set': {
      const nextRemaining = clampNumber(action.remainingMs, state.timer.remainingMs, -24 * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
      state.timer.remainingMs = nextRemaining;
      if (state.timer.running) state.timer.endAt = now() + nextRemaining;
      break;
    }

    case 'rundown:setActive': {
      setActive(state, action.index);
      break;
    }

    case 'rundown:next': {
      setActive(state, Math.min(state.items.length - 1, state.activeIndex + 1));
      break;
    }

    case 'rundown:previous': {
      setActive(state, Math.max(0, state.activeIndex - 1));
      break;
    }

    case 'rundown:add': {
      const item = normalizeItem(action.item || {});
      state.items.push(item);
      break;
    }

    case 'rundown:update': {
      const index = state.items.findIndex((item) => item.id === action.id);
      if (index >= 0) {
        state.items[index] = normalizeItem({ ...state.items[index], ...(action.patch || {}) });
        if (index === state.activeIndex && !state.timer.running) {
          state.timer.durationMs = state.items[index].durationMs;
          state.timer.remainingMs = state.items[index].durationMs;
        }
      }
      break;
    }

    case 'rundown:delete': {
      if (state.items.length <= 1) break;
      const index = state.items.findIndex((item) => item.id === action.id);
      if (index >= 0) {
        state.items.splice(index, 1);
        setActive(state, Math.min(state.activeIndex, state.items.length - 1));
      }
      break;
    }

    case 'rundown:move': {
      const fromIndex = state.items.findIndex((item) => item.id === action.id);
      const toIndex = clampNumber(action.toIndex, fromIndex, 0, state.items.length - 1);
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
        const activeId = activeItem(state).id;
        const [item] = state.items.splice(fromIndex, 1);
        state.items.splice(toIndex, 0, item);
        state.activeIndex = state.items.findIndex((nextItem) => nextItem.id === activeId);
      }
      break;
    }

    case 'rundown:replace': {
      const items = Array.isArray(action.items) ? action.items.map(normalizeItem) : [];
      if (items.length > 0) {
        state.items = items;
        setActive(state, 0);
      }
      break;
    }

    case 'message:set': {
      state.message = String(action.message || '').slice(0, 240);
      break;
    }

    case 'panitiaMessage:add': {
      const message = normalizePanitiaMessage({
        sender: action.sender,
        text: action.text,
        createdAt: now()
      });
      if (message) state.panitiaMessages = [...state.panitiaMessages, message].slice(-40);
      break;
    }

    case 'panitiaMessage:clear': {
      state.panitiaMessages = [];
      break;
    }

    case 'settings:update': {
      state.settings = {
        ...state.settings,
        ...(action.settings || {})
      };
      state.settings.warnAtMs = clampNumber(state.settings.warnAtMs, 60 * 1000, 0, 60 * 60 * 1000);
      state.settings.dangerAtMs = clampNumber(state.settings.dangerAtMs, 10 * 1000, 0, 60 * 60 * 1000);
      state.settings.showNext = Boolean(state.settings.showNext);
      state.settings.showMessage = Boolean(state.settings.showMessage);
      state.settings.allowOverrun = Boolean(state.settings.allowOverrun);
      state.settings.stageClock = Boolean(state.settings.stageClock);
      break;
    }

    default:
      return;
  }

  markChanged(state);
  broadcast(roomId);
}

function localAddresses() {
  const addresses = [];
  Object.values(os.networkInterfaces()).forEach((interfaces) => {
    interfaces.forEach((details) => {
      if (details.family === 'IPv4' && !details.internal) {
        addresses.push(`http://${details.address}:${PORT}`);
      }
    });
  });
  return addresses;
}

loadRooms();

app.use(express.json({ limit: '1mb' }));
app.use((request, response, next) => {
  if (isTrustedLocalHost(request.headers.host)) {
    next();
    return;
  }

  if (request.path === '/') {
    response.redirect(302, '/panitia/main');
    return;
  }

  if (publicPathAllowed(request.path)) {
    next();
    return;
  }

  response.redirect(302, `/panitia/${publicRoomFromPath(request.path)}`);
});
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders(response) {
    response.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, port: PORT, addresses: localAddresses() });
});

app.get('/api/rooms/:roomId', (request, response) => {
  response.json(hydrateForClient(getRoom(request.params.roomId)));
});

function sendApp(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.sendFile(path.join(__dirname, 'public', 'index.html'));
}

app.get(['/control/:roomId', '/stage/:roomId', '/panitia/:roomId', '/speaker/:roomId'], (_request, response) => {
  sendApp(response);
});

app.get('*', (_request, response) => {
  sendApp(response);
});

io.on('connection', (socket) => {
  let joinedRoom = null;
  let joinedRole = 'panitia';
  const publicClient = !isTrustedLocalHost(socket.handshake.headers.host);

  socket.on('room:join', ({ roomId, role }) => {
    joinedRoom = String(roomId || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'main';
    joinedRole = publicClient ? 'panitia' : normalizeRole(role);
    socket.join(joinedRoom);
    socket.emit('room:state', hydrateForClient(getRoom(joinedRoom)));
  });

  socket.on('room:action', (action) => {
    if (!joinedRoom) return;
    applyAction(joinedRoom, action, joinedRole);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localUrl = `http://localhost:${PORT}`;
  console.log(`ShowTimer ready on ${localUrl}`);
  localAddresses().forEach((address) => console.log(`LAN access: ${address}`));
});
