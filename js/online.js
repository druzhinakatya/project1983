/* ============ ONLINE (PeerJS; the host's browser runs the game) ============ */
/* Direct browser connections are blocked inside Claude's artifact viewer, so online play is offered only elsewhere. */
const ONLINE_OK = !/claude/i.test(location.hostname);
const PEER_LIB = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const HOST_KEY = 'sitaratas.host.v1', NAME_KEY = 'sitaratas.name';
const tokenKey = (room) => 'sitaratas.token.' + room;
const REACTS = ['👏', '😬', '😂', '🔥'];
const net = {
  active: false, isHost: false, room: null, peer: null, conns: {}, seats: [], settings: { count: 4, order: 'up' },
  phase: 'lobby', lobby: null, mySeat: null, token: null, name: store.get(NAME_KEY) || '', status: '', error: '',
  hostConn: null, hostOk: false, everConnected: false, retry: null, left: false, paused: [], conn: [], reacts: {}, lastReact: 0, copied: false
};
let joinCode = '';
try { const q = new URLSearchParams(location.search).get('room'); if (q && ONLINE_OK) joinCode = normCode(q); } catch (e) {}

function normCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }
const showCode = (c) => (c && c.length === 6 ? c.slice(0, 4) + '-' + c.slice(4) : c || '');
const peerIdFor = (code) => 'sitaratas-v1-' + code.toLowerCase();
function genCode() {
  const L = 'ABDEFGHJKLMNPRSTUV'; let s = '';
  for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s + String(10 + Math.floor(Math.random() * 90));
}
function newToken() { const a = new Uint8Array(12); try { crypto.getRandomValues(a); } catch (e) { a.forEach((_, i) => { a[i] = Math.random() * 256; }); } return [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); }
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Player';
const inviteLink = () => location.origin + location.pathname + '?room=' + net.room;
let peerLibPromise = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerLibPromise) peerLibPromise = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = PEER_LIB; s.async = true;
    s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('peer')));
    s.onerror = () => { peerLibPromise = null; rej(new Error('peer')); };
    document.head.appendChild(s);
  });
  return peerLibPromise;
}
function send(conn, m) { try { if (conn && conn.open) conn.send(m); } catch (e) {} }
function loadLocalGame() { try { const raw = store.get(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function teardown() {
  clearTimeout(net.retry); clearTimers();
  try { if (net.hostConn) net.hostConn.close(); } catch (e) {}
  for (const id in net.conns) { try { net.conns[id].close(); } catch (e) {} }
  try { if (net.peer) net.peer.destroy(); } catch (e) {}
  Object.assign(net, { active: false, isHost: false, peer: null, conns: {}, hostConn: null, hostOk: false, everConnected: false, lobby: null, paused: [], conn: [], reacts: {}, status: '', backup: null, hostLostAt: null });
  game = loadLocalGame(); ui.viewer = null; ui.modal = null; ui.selBid = null; ui.selCard = null;
}
function isPaused() {
  if (!net.active || net.phase !== 'game') return false;
  return net.isHost ? pausedSeats().length > 0 : (!net.hostOk || net.paused.length > 0);
}
function seatConnected(i) {
  if (!net.active) return true;
  if (net.isHost) { const s = net.seats[i]; return !s || s.kind !== 'human' || !!s.connected; }
  return net.conn[i] !== false;
}
function showReact(seat, e) {
  net.reacts[seat] = { e, at: Date.now() };
  render();
  setTimeout(() => { const r = net.reacts[seat]; if (r && Date.now() - r.at >= 2400) { delete net.reacts[seat]; render(); } }, 2500);
}

/* ---- host ---- */
const hostIdx = () => net.seats.findIndex((s) => s.kind === 'host');
const pausedSeats = () => net.seats.map((s, i) => (s.kind === 'human' && !s.connected ? i : -1)).filter((i) => i >= 0);
function publicSeat(s) { return { kind: s.kind, name: s.name || '', ready: !!s.ready, connected: s.kind !== 'human' || !!s.connected }; }
function redact(g, seat) {
  const v = JSON.parse(JSON.stringify(g));
  if (v.round) v.round.hands = v.round.hands.map((h, k) => (k === seat ? h : h.map(() => 'X0')));
  return v;
}
/* Host handover: the first connected friend in seat order is the "successor". Only they receive a full
   backup of the room (all hands and seat tokens), so they can take over if the host disappears. */
const TAKEOVER_MS = 20000;
const successorIdx = () => net.seats.findIndex((s) => s.kind === 'human' && s.connected && s.peerId);
function backupData() {
  return { room: net.room, settings: net.settings, phase: net.phase, game: net.phase === 'game' ? game : null,
    seats: net.seats.map((s) => ({ kind: s.kind, name: s.name, token: s.token, ready: s.ready })) };
}
function hostMsg(i) {
  const backup = i === successorIdx() ? backupData() : null;
  if (net.phase === 'lobby') return { t: 'lobby', room: net.room, settings: net.settings, you: i, seats: net.seats.map(publicSeat), backup };
  return { t: 'state', room: net.room, you: i, view: redact(game, i), conn: net.seats.map((s) => s.kind !== 'human' || !!s.connected), paused: pausedSeats().map((k) => game.names[k]), backup };
}
function hostBroadcast() {
  net.seats.forEach((s, i) => { if (s.kind === 'human' && s.peerId && net.conns[s.peerId]) send(net.conns[s.peerId], hostMsg(i)); });
}
function hostSave() {
  const seats = net.seats.map((s) => ({ kind: s.kind, name: s.name, token: s.token, ready: s.ready }));
  store.set(HOST_KEY, JSON.stringify({ room: net.room, seats, settings: net.settings, phase: net.phase, game: net.phase === 'game' ? game : null }));
}
function hostChanged() { hostSave(); hostBroadcast(); render(); }
function hostSavedRoom() { try { const raw = store.get(HOST_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
async function hostStart(resume) {
  net.error = ''; net.status = 'connecting'; render();
  let P;
  try { P = await loadPeer(); } catch (e) { net.status = ''; net.error = 'connFailed'; render(); return; }
  if (resume) {
    const sv = hostSavedRoom(); if (!sv) return;
    const h0 = sv.seats.find((s) => s.kind === 'host');
    // If a friend took over while we were away, join them as a normal player instead of reopening the room.
    if (await probeRoom(P, sv.room)) {
      if (h0 && h0.token) store.set(tokenKey(sv.room), h0.token);
      if (h0) net.name = h0.name;
      store.del(HOST_KEY); net.status = '';
      clientJoin(sv.room);
      return;
    }
    net.room = sv.room; net.settings = sv.settings; net.phase = sv.phase;
    net.seats = sv.seats.map((s) => ({ ...s, connected: s.kind === 'host', peerId: null }));
    game = sv.game;
    if (net.phase === 'game' && !game) net.phase = 'lobby';
    const h = net.seats[hostIdx()];
    if (h) { net.name = h.name; if (!h.token) h.token = newToken(); store.set(tokenKey(net.room), h.token); }
  } else {
    net.room = genCode(); net.phase = 'lobby'; game = null;
    net.settings = { count: 4, order: 'up' };
    // The host's seat has a token too, so the host can rejoin as a player if someone else takes over.
    const token = newToken(); store.set(tokenKey(net.room), token);
    net.seats = [{ kind: 'host', name: cleanName(net.name), token, connected: true, ready: true }];
    while (net.seats.length < net.settings.count) net.seats.push({ kind: 'open' });
  }
  Object.assign(net, { active: true, isHost: true, conns: {}, reacts: {} });
  net.mySeat = hostIdx(); ui.viewer = net.mySeat; ui.modal = null;
  ui.screen = net.phase === 'game' ? 'game' : 'lobby';
  hostSave();
  openHostPeer(P, 0);
  render();
}
/* Is anyone hosting this room right now? Resolves true if a connection opens within 7 seconds. */
function probeRoom(P, room) {
  return new Promise((resolve) => {
    let done = false;
    const p = new P({ debug: 0 });
    const finish = (v) => { if (done) return; done = true; try { p.destroy(); } catch (e) {} resolve(v); };
    p.on('open', () => { const c = p.connect(peerIdFor(room), { reliable: true, serialization: 'json' }); c.on('open', () => finish(true)); c.on('error', () => finish(false)); });
    p.on('error', () => finish(false));
    setTimeout(() => finish(false), 7000);
  });
}
/* The successor becomes the host: same room code, game restored from the backup, the old host's seat
   becomes an offline player (they can return, or be replaced with a bot). */
async function takeOver() {
  const b = net.backup; if (!b || net.isHost) return;
  const me = b.seats.findIndex((s) => s.token && s.token === net.token);
  if (me < 0) return;
  let P;
  try { P = await loadPeer(); } catch (e) { return; }
  clearTimeout(net.retry);
  try { if (net.hostConn) net.hostConn.close(); } catch (e) {}
  try { if (net.peer) net.peer.destroy(); } catch (e) {}
  net.seats = b.seats.map((s, i) => {
    if (i === me) return { ...s, kind: 'host', connected: true, peerId: null, ready: true };
    if (s.kind === 'host') return { ...s, kind: 'human', connected: false, peerId: null, ready: false };
    return { ...s, connected: false, peerId: null };
  });
  game = b.game; net.settings = b.settings; net.phase = b.game ? b.phase : 'lobby'; net.room = b.room;
  Object.assign(net, { active: true, isHost: true, conns: {}, reacts: {}, hostConn: null, backup: null, hostLostAt: null, hostOk: false, status: 'connecting', left: false });
  net.mySeat = me; ui.viewer = me; ui.modal = null; ui.screen = net.phase === 'game' ? 'game' : 'lobby';
  store.del(LAST_JOIN_KEY);
  clearTimers(); hostSave();
  openHostPeer(P, 0);
  render();
  toast(`<span class="toast-icon">👑</span><span><b>${t('youAreHost')}</b></span>`);
}
function openHostPeer(P, attempt) {
  const peer = new P(peerIdFor(net.room), { debug: 0 });
  net.peer = peer;
  peer.on('open', () => { net.status = ''; net.error = ''; render(); });
  peer.on('connection', (conn) => {
    conn.on('data', (m) => hostOnMessage(conn, m));
    conn.on('close', () => hostOnClose(conn, false));
    conn.on('error', () => hostOnClose(conn, false));
  });
  peer.on('disconnected', () => { if (!peer.destroyed && net.peer === peer) { try { peer.reconnect(); } catch (e) {} } });
  peer.on('error', (err) => {
    if (net.peer !== peer) return;
    if (err.type === 'unavailable-id' && attempt < 30) {
      net.status = 'idTaken'; render();
      try { peer.destroy(); } catch (e) {}
      setTimeout(() => { if (net.active && net.isHost) openHostPeer(P, attempt + 1); }, 3000);
    } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible', 'unavailable-id', 'ssl-unavailable'].includes(err.type)) {
      net.status = ''; net.error = 'connFailed'; render();
    }
  });
}
const seatOfConn = (conn) => net.seats.findIndex((s) => s.peerId === conn.peer && s.kind === 'human');
function hostOnMessage(conn, m) {
  if (!m || typeof m !== 'object' || !net.active || !net.isHost) return;
  if (m.t === 'hello') {
    const token = String(m.token || '').slice(0, 40), name = cleanName(m.name);
    let i = token ? net.seats.findIndex((s) => s.token === token) : -1;
    if (i >= 0) {
      const s = net.seats[i];
      if (s.peerId && s.peerId !== conn.peer && net.conns[s.peerId]) { const old = net.conns[s.peerId]; delete net.conns[s.peerId]; try { old.close(); } catch (e) {} }
      s.peerId = conn.peer; s.connected = true;
      if (net.phase === 'lobby') { s.name = name; s.kind = 'human'; }
      else if (s.kind === 'bot') { s.kind = 'human'; game.bots[i] = false; }
    } else if (net.phase === 'lobby') {
      i = net.seats.findIndex((s) => s.kind === 'open');
      if (i < 0) { send(conn, { t: 'full' }); setTimeout(() => { try { conn.close(); } catch (e) {} }, 400); return; }
      net.seats[i] = { kind: 'human', name, token, peerId: conn.peer, connected: true, ready: false };
    } else { send(conn, { t: 'started' }); setTimeout(() => { try { conn.close(); } catch (e) {} }, 400); return; }
    net.conns[conn.peer] = conn;
    hostChanged();
    return;
  }
  const i = seatOfConn(conn);
  if (i < 0) return;
  if (m.t === 'ready' && net.phase === 'lobby') { net.seats[i].ready = !!m.v; hostChanged(); }
  else if (m.t === 'bid' || m.t === 'play') {
    const r = game && !game.over && game.round;
    if (!r || isPaused() || r.turn !== i) return;
    try {
      if (m.t === 'bid' && Number.isInteger(m.b)) Engine.placeBid(game, i, m.b);
      else if (m.t === 'play') Engine.playCard(game, i, String(m.c));
      else return;
    } catch (e) { return; }
    hostChanged();
  } else if (m.t === 'react' && REACTS.includes(m.e)) {
    const s = net.seats[i], now = Date.now();
    if (now - (s.lastReact || 0) < 800) return;
    s.lastReact = now; hostReact(i, m.e);
  } else if (m.t === 'ach' && achById(m.id)) {
    hostAnnounceAch(i, m.id);
    achToast(m.id, net.seats[i].name || (game && game.names[i]));
  } else if (m.t === 'leave') hostOnClose(conn, true);
}
function hostReact(seat, e) {
  net.seats.forEach((s) => { if (s.kind === 'human' && s.peerId && net.conns[s.peerId]) send(net.conns[s.peerId], { t: 'react', seat, e }); });
  showReact(seat, e);
}
function hostOnClose(conn, leaving) {
  if (!net.active || !net.isHost) return;
  const i = net.seats.findIndex((s) => s.peerId === conn.peer);
  if (net.conns[conn.peer] === conn) delete net.conns[conn.peer];
  if (i < 0 || net.seats[i].peerId !== conn.peer) return;
  if (net.phase === 'lobby' && leaving) net.seats[i] = { kind: 'open' };
  else { net.seats[i].connected = false; net.seats[i].peerId = null; if (net.phase === 'lobby') net.seats[i].ready = false; }
  hostChanged();
}
function hostCanStart() {
  return net.seats.every((s) => s.kind === 'host' || s.kind === 'bot' || (s.kind === 'human' && s.connected && s.ready));
}
function hostAct(a, el) {
  const i = el && el.dataset.i != null ? +el.dataset.i : -1;
  const S = net.seats;
  switch (a) {
    case 'oCount': {
      const n = +el.dataset.v;
      if (S.slice(n).some((s) => s.kind === 'human' || s.kind === 'host')) return;
      net.seats = S.slice(0, n); while (net.seats.length < n) net.seats.push({ kind: 'open' });
      net.settings.count = n; break;
    }
    case 'oOrder': net.settings.order = el.dataset.v; break;
    case 'oHalf': net.settings.half = el.dataset.v === '1'; break;
    case 'oBot': if (S[i] && S[i].kind === 'open') S[i] = { kind: 'bot' }; break;
    case 'oOpen': if (S[i] && S[i].kind === 'bot') S[i] = { kind: 'open' }; break;
    case 'oKick':
      if (S[i] && S[i].kind === 'human') {
        const c = S[i].peerId && net.conns[S[i].peerId];
        if (c) { send(c, { t: 'kicked' }); delete net.conns[S[i].peerId]; setTimeout(() => { try { c.close(); } catch (e) {} }, 400); }
        S[i] = { kind: 'open' };
      }
      break;
    case 'oMove': {
      const j = i + (+el.dataset.d);
      if (j < 0 || j >= S.length) return;
      [S[i], S[j]] = [S[j], S[i]]; net.mySeat = hostIdx(); break;
    }
    case 'oStart': {
      if (!hostCanStart()) return;
      const names = S.map((s, k) => (s.kind === 'bot' ? 'Bot ' + (k + 1) : s.name));
      game = Engine.newGame(names, net.settings.order, net.settings.half);
      game.bots = S.map((s) => s.kind === 'bot');
      net.phase = 'game'; net.mySeat = hostIdx(); ui.viewer = net.mySeat; ui.screen = 'game';
      ui.selBid = null; ui.selCard = null; clearTimers(); break;
    }
    case 'oReplace': if (S[i] && S[i].kind === 'human' && game) { S[i].kind = 'bot'; S[i].connected = false; game.bots[i] = true; } break;
    case 'oBackLobby':
      net.phase = 'lobby'; game = null; clearTimers(); ui.screen = 'lobby';
      S.forEach((s) => { if (s.kind === 'human') s.ready = false; });
      net.seats = S.map((s) => (s.kind === 'bot' && s.token ? { kind: 'open' } : s));
      break;
    case 'oEnd': {
      S.forEach((s) => { if (s.kind === 'human' && s.peerId && net.conns[s.peerId]) send(net.conns[s.peerId], { t: 'closed' }); });
      store.del(HOST_KEY);
      setTimeout(teardown, 300);
      net.active = false; ui.screen = 'home'; ui.modal = null; game = loadLocalGame();
      render(); return;
    }
    default: return;
  }
  hostChanged();
}

/* ---- friend (client) ---- */
async function clientJoin(code) {
  net.error = ''; net.status = 'connecting'; render();
  let P;
  try { P = await loadPeer(); } catch (e) { net.status = ''; net.error = 'connFailed'; render(); return; }
  Object.assign(net, { active: true, isHost: false, room: code, left: false, hostOk: false, everConnected: false, lobby: null, reacts: {} });
  net.token = store.get(tokenKey(code)) || newToken(); store.set(tokenKey(code), net.token);
  game = null; ui.screen = 'lobby'; ui.modal = null; render();
  const peer = new P({ debug: 0 });
  net.peer = peer;
  peer.on('open', () => clientConnect());
  peer.on('disconnected', () => { if (!peer.destroyed && net.peer === peer) { try { peer.reconnect(); } catch (e) {} } });
  peer.on('error', (err) => {
    if (net.peer !== peer || !net.active) return;
    if (err.type === 'peer-unavailable') {
      if (net.everConnected) { net.hostOk = false; if (!net.hostLostAt) net.hostLostAt = Date.now(); scheduleReconnect(); render(); }
      else { const c = net.room; store.del(LAST_JOIN_KEY); teardown(); joinCode = c; net.error = 'roomNotFound'; ui.onlineMode = 'join'; ui.screen = 'online'; render(); }
    } else if (['network', 'server-error', 'socket-error', 'browser-incompatible', 'ssl-unavailable'].includes(err.type) && !net.everConnected) {
      teardown(); net.error = 'connFailed'; ui.screen = 'online'; render();
    }
  });
}
function clientConnect() {
  if (!net.active || net.left || !net.peer || net.peer.destroyed) return;
  const conn = net.peer.connect(peerIdFor(net.room), { reliable: true, serialization: 'json' });
  net.hostConn = conn;
  // Watchdog: an attempt can hang without opening or failing (e.g. while the host is changing). Retry it.
  setTimeout(() => {
    if (net.hostConn === conn && !conn.open && net.active && !net.left && !net.isHost) {
      try { conn.close(); } catch (e) {}
      if (!net.hostLostAt) net.hostLostAt = Date.now();
      scheduleReconnect();
    }
  }, 6000);
  conn.on('open', () => {
    if (net.hostConn !== conn) return;
    net.hostOk = true; net.everConnected = true; net.status = ''; net.hostLostAt = null;
    send(conn, { t: 'hello', token: net.token, name: cleanName(net.name) });
    render();
  });
  conn.on('data', (m) => { if (net.hostConn === conn) clientOnMessage(m); });
  conn.on('close', () => {
    if (net.hostConn !== conn) return;
    net.hostOk = false;
    if (!net.hostLostAt) net.hostLostAt = Date.now();
    if (!net.left && net.active) { scheduleReconnect(); render(); }
  });
}
/* Retry the host every 3 seconds. The successor takes over once the host has been gone for TAKEOVER_MS. */
function scheduleReconnect() {
  clearTimeout(net.retry);
  net.retry = setTimeout(() => {
    if (!net.active || net.isHost || net.left) return;
    if (net.backup && net.hostLostAt && Date.now() - net.hostLostAt >= TAKEOVER_MS) { takeOver(); return; }
    render();
    clientConnect();
  }, 3000);
}
const takeoverSecondsLeft = () => Math.max(0, Math.ceil((TAKEOVER_MS - (Date.now() - (net.hostLostAt || Date.now()))) / 1000));
function clientOnMessage(m) {
  if (!m || typeof m !== 'object') return;
  if ((m.t === 'lobby' || m.t === 'state') && net.room) store.set(LAST_JOIN_KEY, JSON.stringify({ room: net.room, at: Date.now() }));
  if (m.t === 'lobby' || m.t === 'state') net.backup = m.backup || null;
  if (m.t === 'lobby') { net.lobby = m; net.mySeat = m.you; net.phase = 'lobby'; game = null; ui.screen = 'lobby'; ui.modal = null; render(); }
  else if (m.t === 'state') {
    const prevTurn = game && game.round ? game.round.turn : null;
    game = m.view; net.mySeat = m.you; ui.viewer = m.you; net.conn = m.conn || []; net.paused = m.paused || []; net.phase = 'game';
    if (ui.screen !== 'game') { ui.screen = 'game'; ui.modal = null; }
    if (!game.round || game.round.turn !== ui.viewer || prevTurn !== game.round.turn) { ui.selBid = null; ui.selCard = null; }
    render();
  } else if (m.t === 'react' && REACTS.includes(m.e)) showReact(m.seat, m.e);
  else if (m.t === 'achSeen' && achById(m.id) && m.seat !== net.mySeat && game && game.names[m.seat]) achToast(m.id, game.names[m.seat]);
  else if (['full', 'started', 'kicked', 'closed'].includes(m.t)) {
    store.del(LAST_JOIN_KEY);
    const key = { full: 'roomFull', started: 'gameStarted', kicked: 'kicked', closed: 'roomClosed' }[m.t];
    net.left = true; teardown(); net.error = key; ui.screen = 'online'; render();
  }
}
/* ---- Rejoin: a banner on the main menu for a room you host or were playing in ---- */
const LAST_JOIN_KEY = 'sitaratas.lastJoin';
const REJOIN_MAX_AGE = 12 * 60 * 60 * 1000;
function lastJoined() {
  try { const j = JSON.parse(store.get(LAST_JOIN_KEY)); if (j && j.room && Date.now() - j.at < REJOIN_MAX_AGE) return j; } catch (e) {}
  return null;
}
function rejoinBanner() {
  if (!ONLINE_OK || net.active) return '';
  const hosted = hostSavedRoom(), joined = lastJoined();
  if (!hosted && !joined) return '';
  const code = showCode(hosted ? hosted.room : joined.room);
  const msg = hosted ? t('roomStillOpen', { code }) : t('gameStillOn', { code });
  return `<div class="rejoin"><span class="rejoin-dot" aria-hidden="true"></span><span class="rejoin-text">${msg}</span>
    <button class="btn primary" data-a="${hosted ? 'resumeRoom' : 'rejoinRoom'}">${hosted ? t('resume') : t('rejoin')}</button>
    <button class="btn ghost sm" data-a="${hosted ? 'forgetRoom' : 'forgetJoin'}">${t('forget')}</button></div>`;
}
function clientLeave() { store.del(LAST_JOIN_KEY); send(net.hostConn, { t: 'leave' }); net.left = true; setTimeout(teardown, 200); net.active = false; game = loadLocalGame(); ui.screen = 'home'; ui.modal = null; }

/* ---- online screens ---- */
function onlineView() {
  const saved = hostSavedRoom();
  const statusLine = net.status === 'connecting' ? `<p class="hint">${t('connecting')}</p>` : '';
  const err = net.error ? `<p class="err">${t(net.error, { code: showCode(joinCode) })}</p>` : '';
  const hosting = ui.onlineMode === 'host' && !joinCode;
  const body = hosting
    ? `<div class="field"><button class="btn primary big" data-a="hostNew">${t('hostGame')}</button><span class="hint">${t('hostHint')}</span></div>
      ${saved ? `<div class="divider"></div><button class="btn" data-a="hostResume">${t('resumeHost', { code: showCode(saved.room) })}</button>` : ''}`
    : `<div class="field"><label class="label" for="onCode">${t('roomCode')}</label>
        <div class="row"><input class="text-in code-in" id="onCode" maxlength="7" value="${esc(showCode(joinCode))}" placeholder="KASK-42" autocomplete="off">
        <button class="btn primary big" data-a="joinGo">${t('join')}</button></div><span class="hint">${t('joinOptHint')}</span></div>`;
  return `<div class="center-col">
    <div class="row" style="justify-content: space-between">
      <h1 style="font-size: 36px">${hosting ? t('hostGame') : t('joinGame')}</h1>
      <button class="btn ghost" data-a="home">${t('back')}</button>
    </div>
    <div class="panel">
      <div class="field"><label class="label" for="onName">${t('yourName')}</label>
        <input class="text-in" id="onName" maxlength="16" value="${esc(net.name)}" autocomplete="nickname"></div>
      ${body}
      ${statusLine}${err}
    </div>
  </div>`;
}
function lobbyView() {
  const host = net.isHost;
  const seats = host ? net.seats.map(publicSeat) : (net.lobby ? net.lobby.seats : []);
  const settings = host ? net.settings : (net.lobby ? net.lobby.settings : null);
  if (!settings) {
    return `<div class="center-col"><div class="row" style="justify-content: space-between"><h1 style="font-size: 32px">${t('room')} ${esc(showCode(net.room))}</h1>
      <button class="btn ghost" data-a="leaveOnline">${t('leave')}</button></div>
      <div class="panel"><p class="hint" style="margin:0">${net.everConnected && !net.hostOk ? t('hostLost') : t('connecting')}</p></div></div>`;
  }
  const n = settings.count, m = Engine.maxHand(n), rounds = Engine.buildSchedule(n, settings.order, settings.half).length;
  const rows = seats.map((s, i) => {
    const me = i === net.mySeat;
    let chip;
    if (s.kind === 'open') chip = `<span class="chip">${t('seatOpen')}</span>`;
    else if (s.kind === 'bot') chip = `<span class="chip accent">${t('bot')}</span>`;
    else if (s.kind === 'host') chip = `<span class="chip accent">${t('seatHost')}</span>`;
    else if (!s.connected) chip = `<span class="chip warn">${t('offline')}</span>`;
    else chip = s.ready ? `<span class="chip good">${t('ready')}</span>` : `<span class="chip">${t('notReady')}</span>`;
    const nm = s.kind === 'open' ? `<span class="hint">—</span>` : s.kind === 'bot' ? `Bot ${i + 1}` : esc(s.name) + (me ? ` <span class="hint">(${t('you')})</span>` : '');
    let ctl = '';
    if (host) {
      ctl += `<button class="btn ghost sm" data-a="oMove" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('moveUp')}">↑</button>`;
      ctl += `<button class="btn ghost sm" data-a="oMove" data-i="${i}" data-d="1" ${i === seats.length - 1 ? 'disabled' : ''} aria-label="${t('moveDown')}">↓</button>`;
      if (s.kind === 'open') ctl += `<button class="btn sm" data-a="oBot" data-i="${i}">${t('addBot')}</button>`;
      if (s.kind === 'bot') ctl += `<button class="btn sm" data-a="oOpen" data-i="${i}">${t('removeBot')}</button>`;
      if (s.kind === 'human') ctl += `<button class="btn sm danger" data-a="oKick" data-i="${i}">${t('kick')}</button>`;
    }
    return `<div class="lseat"><span class="seatno num">${i + 1}</span><span class="lname">${nm}</span>${chip}<span class="lctl">${ctl}</span></div>`;
  }).join('');
  const settingsHTML = host
    ? `<div class="row" style="gap:18px"><div class="field"><span class="label">${t('players')}</span><div class="seg">${[3, 4, 5, 6].map((k) => `<button type="button" data-a="oCount" data-v="${k}" aria-pressed="${k === n}">${k}</button>`).join('')}</div></div>
       <div class="field"><span class="label">${t('gameLength')}</span>${lengthSeg('oHalf', settings.half)}</div>
       <div class="field"><span class="label">${t('roundOrder')}</span><div class="seg"><button type="button" data-a="oOrder" data-v="up" aria-pressed="${settings.order === 'up'}">${orderLabel('up', settings.half)}</button><button type="button" data-a="oOrder" data-v="down" aria-pressed="${settings.order === 'down'}">${orderLabel('down', settings.half)}</button></div></div></div>`
    : `<div class="hint">${settings.half ? t('halfGame') : t('fullGame')} · ${orderLabel(settings.order, settings.half)}</div>`;
  let foot;
  if (host) {
    const full = net.seats.every((s) => s.kind !== 'open');
    const reason = !full ? t('startWaitSeats') : !hostCanStart() ? t('startWaitReady') : '';
    foot = `<div class="row" style="justify-content: space-between"><span class="hint">${reason || t('summary', { n, m, r: rounds })}</span>
      <button class="btn primary big" data-a="oStart" ${reason ? 'disabled' : ''}>${t('start')}</button></div>`;
  } else {
    const mine = seats[net.mySeat];
    const ready = mine && mine.ready;
    foot = `<div class="row" style="justify-content: space-between"><span class="hint">${net.hostOk ? t('waitHostStart') : t('hostLost') + (net.backup ? ' ' + t('takeoverIn', { s: takeoverSecondsLeft() }) : '')}</span>
      <button class="btn ${ready ? '' : 'primary'} big" data-a="readyToggle">${ready ? t('notReadyBtn') : t('imReady')}</button></div>`;
  }
  const invite = host ? `<div class="field"><span class="label">${t('invite')}</span><div class="row"><input class="text-in invite-in" id="inviteLink" readonly value="${esc(inviteLink())}">
    <button class="btn" data-a="copyInvite">${net.copied ? t('copied') : t('copy')}</button></div></div>` : '';
  const status = net.status === 'idTaken' ? `<p class="hint">${t('idTaken', { code: showCode(net.room) })}</p>` : net.status === 'connecting' ? `<p class="hint">${t('connecting')}</p>` : net.error ? `<p class="err">${t(net.error)}</p>` : '';
  return `<div class="center-col lobby">
    <div class="row" style="justify-content: space-between">
      <h1 style="font-size: 32px">${t('room')} <span class="code">${esc(showCode(net.room))}</span></h1>
      <button class="btn ghost" data-a="${host ? 'endAsk' : 'leaveOnline'}">${host ? t('endForAll') : t('leave')}</button>
    </div>
    <div class="panel">
      ${invite}
      ${settingsHTML}
      <div class="field"><span class="label">${t('playersLbl')} · <span class="num">${t('summary', { n, m, r: rounds })}</span></span><div class="lseats">${rows}</div></div>
      ${foot}
      ${status}
    </div>
  </div>`;
}
function pauseView() {
  if (!net.active || net.phase !== 'game' || !game || game.over) return '';
  let body;
  if (net.isHost) {
    const ids = pausedSeats(); if (!ids.length) return '';
    body = `<h2>${t('waitingFor', { names: ids.map((i) => esc(game.names[i])).join(', ') })}</h2>
      <div class="menu-list">${ids.map((i) => `<button class="btn" data-a="oReplace" data-i="${i}">${t('replaceBot', { name: esc(game.names[i]) })}</button>`).join('')}</div>`;
  } else if (!net.hostOk) body = `<h2>${t('hostLost')}</h2>${net.backup ? `<p class="hint">${t('takeoverIn', { s: takeoverSecondsLeft() })}</p>` : ''}`;
  else if (net.paused.length) body = `<h2>${t('waitingFor', { names: net.paused.map(esc).join(', ') })}</h2>`;
  else return '';
  return `<div class="overlay pause"><div class="modal">${body}
    <div class="row"><button class="btn ghost" data-a="${net.isHost ? 'endAsk' : 'leaveAsk'}">${net.isHost ? t('endForAll') : t('leave')}</button></div></div></div>`;
}

