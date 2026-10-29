/* ============ RENDER ============ */
/* A fingerprint of everything game events depend on; when it is unchanged, nothing new happened. */
function stateSig() {
  if (!game) return ui.screen;
  const r = game.round;
  return [ui.screen, game.id, game.roundIdx, game.over, game.history.length, ui.viewer, isPaused(),
    r ? [r.phase, r.turn, r.trick.length, r.bids.join(',')].join('/') : '-',
    game.streak ? game.streak.p + ':' + game.streak.n : '-'].join('|');
}
function render() {
  // Game-event work (achievements, stats, bid bubbles, deal start, sounds) only runs when the game state
  // actually changed, not on every redraw (menus, reactions, resizes, typing).
  const sig = stateSig();
  if (sig !== ui.lastSig) {
    ui.lastSig = sig;
    if (ui.screen === 'game' && game) {
      try { checkAchievements(); } catch (e) {}
      try { trackStats(); } catch (e) {}
      if (!game.over) trackRoundEvents();
    }
    try { soundEvents(); } catch (e) {}
  }
  document.documentElement.lang = lang;
  const app = $('#app');
  const focusId = document.activeElement && document.activeElement.id;
  const caret = focusId && document.activeElement.selectionStart;
  let html;
  if (ui.screen === 'home') html = homeView();
  else if (ui.screen === 'setup') html = setupView();
  else if (ui.screen === 'online') html = onlineView();
  else if (ui.screen === 'lobby') html = lobbyView();
  else if (ui.screen === 'player') html = playerView();
  else if (!game) html = homeView();
  else if (game.over) html = endView();
  else {
    const r = game.round;
    const runsTimers = !net.active || net.isHost;
    const paused = isPaused();
    html = topbar() + tableScene() + dockView();
    if (r.phase === 'roundDone') {
      // Plates glow green/red for the round's result; the full summary only appears at the halfway round.
      const half = isHalfwayRound();
      if (half) html += bannerView();
      if (runsTimers && !paused && !ui.bannerTimer) ui.bannerTimer = setTimeout(advanceRound, half ? 4000 : RESULT_MS);
    } else if (!net.active && needsCover() && !ui.modal) html += coverView();
    if (runsTimers && !paused && !ui.botTimer && (net.active || !ui.modal)) {
      if ((r.phase === 'bidding' || r.phase === 'playing') && isBot(r.turn)) {
        // Bots wait for the deal animation to finish before their first bid.
        const dealLeft = dealActive() ? ui.deal.at + ui.deal.duration - Date.now() + 250 : 0;
        ui.botTimer = setTimeout(botStep, Math.max(BOT_DELAY, dealLeft));
      }
      else if (r.phase === 'trickDone') {
        const elapsed = ui.trickAnim ? Date.now() - ui.trickAnim.at : 0;
        ui.botTimer = setTimeout(autoContinueTrick, Math.max(0, trickHold() + COLLECT_MS - elapsed));
      }
    }
    html += pauseView();
    // Your turn: a soft blue glow around the edges of the screen.
    if (myTurn() && !(needsCover() && !net.active)) html += '<div class="turn-glow" id="turnGlow" aria-hidden="true"></div>';
  }
  if (ui.modal) html += modalView();
  html += settingsButton();
  const before = snapshotRects();
  paint(app, html);
  afterPaint(before, app);
  const cover = $('#cover'); if (cover && document.activeElement !== cover) cover.focus();
  if (focusId && !cover && (!document.activeElement || document.activeElement.id !== focusId)) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch (e) {} }
  }
}

/* ============ SMOOTH UPDATES ============ */
/* Instead of rebuilding the screen, morphdom changes only what differs, so elements stay put,
   CSS transitions run, and animations already playing are not restarted. */
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
function paint(app, html) {
  if (!window.morphdom) { app.innerHTML = html; return; }
  const next = app.cloneNode(false);
  next.innerHTML = html;
  window.morphdom(app, next, {
    childrenOnly: true,
    onBeforeElUpdated(fromEl, toEl) {
      if (fromEl.isEqualNode(toEl)) return false;
      // An element mid-animation keeps its own timing (its inline delay was set when it first appeared).
      const k = fromEl.getAttribute('data-anim');
      if (k && k === toEl.getAttribute('data-anim')) {
        const s = fromEl.getAttribute('style');
        if (s == null) toEl.removeAttribute('style'); else toEl.setAttribute('style', s);
      }
      if (fromEl.classList.contains('flown')) toEl.classList.add('flown');
      return true;
    }
  });
}
/* Remember where hand cards and seat plates were, so moves can be animated from there (FLIP). */
function snapshotRects() {
  const m = new Map();
  document.querySelectorAll('[id^="hc-"], [id^="plate-"]').forEach((el) => m.set(el.id, el.getBoundingClientRect()));
  return { m, tc: new Set([...document.querySelectorAll('[id^="tc-"]')].map((e) => e.id)), screen: lastScreenKey };
}
let lastScreenKey = null;
function afterPaint(before, app) {
  const screenKey = ui.screen + (game && game.over ? ':over' : '');
  const changedScreen = screenKey !== lastScreenKey;
  lastScreenKey = screenKey;
  if (reduceMotion() || !app.animate) return;
  if (changedScreen && before.screen != null) app.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  // Cards still in your hand glide into their new places when one leaves.
  document.querySelectorAll('[id^="hc-"]').forEach((el) => {
    const r0 = before.m.get(el.id); if (!r0) return;
    const r1 = el.getBoundingClientRect();
    const dx = r0.left - r1.left, dy = r0.top - r1.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 280, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  });
  // A newly played card flies from your hand, or from the player's seat, to its spot on the table.
  document.querySelectorAll('[id^="tc-"]').forEach((el) => {
    if (before.tc.has(el.id)) return;
    const c = el.id.slice(3), p = el.dataset.p;
    const plateNow = document.getElementById('plate-' + p);
    const r0 = before.m.get('hc-' + c) || before.m.get('plate-' + p) || (plateNow && plateNow.getBoundingClientRect());
    const inner = el.querySelector('.card');
    if (!r0 || !inner) return;
    const r1 = inner.getBoundingClientRect();
    const dx = (r0.left + r0.width / 2) - (r1.left + r1.width / 2), dy = (r0.top + r0.height / 2) - (r1.top + r1.height / 2);
    el.classList.add('flown');
    inner.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.85)`, opacity: 0.85 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  });
}

/* ============ ACTIONS ============ */
/* Persist (local) or save + send to friends (host). Friends never change the game themselves. */
function afterChange() {
  if (net.active) { if (net.isHost) { hostSave(); hostBroadcast(); } }
  else save();
}
function advanceRound() {
  clearTimeout(ui.bannerTimer); ui.bannerTimer = null;
  if (!game || !game.round || game.round.phase !== 'roundDone' || isPaused()) return;
  if (net.active && !net.isHost) return;
  Engine.nextRound(game);
  if (net.active) ui.viewer = net.mySeat; else resetViewer();
  ui.selBid = null; ui.selCard = null;
  afterChange(); render();
}
function autoContinueTrick() {
  ui.botTimer = null;
  if (!game || !game.round || game.round.phase !== 'trickDone' || isPaused()) return;
  Engine.continueTrick(game); ui.trickAnim = null; afterChange(); render();
}
function botStep() {
  ui.botTimer = null;
  const r = game && !game.over && game.round;
  if (!r || ui.screen !== 'game' || !isBot(r.turn) || isPaused()) return;
  if (net.active && !net.isHost) return;
  if (r.phase === 'bidding') Engine.placeBid(game, r.turn, Bot.bid(r, r.turn));
  else if (r.phase === 'playing') Engine.playCard(game, r.turn, Bot.play(r, r.turn));
  else return;
  afterChange(); render();
}
function startGame(names, order, bots, half) {
  clearTimers();
  game = Engine.newGame(names, order, half);
  game.bots = bots.slice(0, names.length);
  ui.screen = 'game'; resetViewer(); ui.selBid = null; ui.selCard = null; ui.modal = null;
  save(); render();
}
function myTurn() { const r = game && game.round; return !!r && r.turn === ui.viewer && !isBot(r.turn) && !isPaused(); }
function act(a, el) {
  if (a.startsWith('o') && a.length > 1 && a[1] === a[1].toUpperCase()) { if (net.active && net.isHost) hostAct(a, el); return; }
  switch (a) {
    case 'toSetup': ui.screen = 'setup'; break;
    case 'home': net.error = ''; joinCode = ''; ui.screen = 'home'; break;
    case 'continue': ui.screen = 'game'; resetViewer(); break;
    case 'toPlayer': ui.screen = 'player'; ui.statsReset = false; break;
    case 'playerTab': ui.playerTab = el.dataset.v; ui.statsReset = false; break;
    case 'statsResetAsk': ui.statsReset = true; break;
    case 'statsResetNo': ui.statsReset = false; break;
    case 'statsResetYes': resetStats(); ui.statsReset = false; break;
    case 'sound': Sfx.toggle(); break;
    case 'resumeRoom': hostStart(true); return;
    case 'forgetRoom': store.del(HOST_KEY); break;
    case 'rejoinRoom': {
      const j = lastJoined(); if (!j) break;
      joinCode = j.room;
      if (net.name.trim()) { clientJoin(j.room); return; }
      ui.onlineMode = 'join'; ui.screen = 'online'; break;
    }
    case 'forgetJoin': store.del(LAST_JOIN_KEY); break;
    case 'toHost': net.error = ''; joinCode = ''; ui.onlineMode = 'host'; ui.screen = 'online'; break;
    case 'toJoin': net.error = ''; ui.onlineMode = 'join'; ui.screen = 'online'; break;
    case 'hostNew': case 'hostResume': case 'joinGo': {
      const nameEl = $('#onName'); if (nameEl) net.name = nameEl.value;
      if (!net.name.trim()) { net.error = 'nameNeeded'; break; }
      net.name = cleanName(net.name); store.set(NAME_KEY, net.name);
      if (a === 'joinGo') {
        const codeEl = $('#onCode'); const code = normCode(codeEl ? codeEl.value : joinCode);
        if (code.length !== 6) { net.error = 'codeNeeded'; break; }
        joinCode = code; clientJoin(code);
      } else hostStart(a === 'hostResume');
      return;
    }
    case 'copyInvite': {
      const link = inviteLink(), inp = $('#inviteLink');
      const done = () => { net.copied = true; render(); setTimeout(() => { net.copied = false; render(); }, 1500); };
      try { navigator.clipboard.writeText(link).then(done, () => { if (inp) inp.select(); }); } catch (e) { if (inp) inp.select(); }
      return;
    }
    case 'readyToggle': {
      const mine = net.lobby && net.lobby.seats[net.mySeat];
      send(net.hostConn, { t: 'ready', v: !(mine && mine.ready) }); return;
    }
    case 'leaveOnline': clientLeave(); break;
    case 'leaveAsk': ui.modal = 'abandon'; break;
    case 'endAsk': ui.modal = 'abandon'; break;
    case 'react': {
      const e = el.dataset.v, now = Date.now();
      if (!net.active || !REACTS.includes(e) || now - net.lastReact < 800) return;
      net.lastReact = now;
      if (net.isHost) hostReact(net.mySeat, e); else send(net.hostConn, { t: 'react', e });
      return;
    }
    case 'lang': lang = lang === 'en' ? 'et' : 'en'; store.set(LANG_KEY, lang); break;
    case 'rules': ui.modal = 'rules'; break;
    case 'sheet': ui.modal = 'sheet'; break;
    case 'menu': ui.modal = 'menu'; break;
    case 'lastTrick': ui.modal = 'lastTrick'; break;
    case 'closeModal': ui.modal = null; break;
    case 'abandonAsk': ui.modal = 'abandon'; break;
    case 'abandonYes':
      if (net.active) { if (net.isHost) { hostAct('oEnd'); return; } clientLeave(); break; }
      clearTimers(); game = null; store.del(SAVE_KEY); ui.modal = null; ui.screen = 'setup'; break;
    case 'count': ui.setup.count = +el.dataset.v; break;
    case 'order': ui.setup.order = el.dataset.v; break;
    case 'half': ui.setup.half = el.dataset.v === '1'; break;
    case 'kind': ui.setup.bots[+el.dataset.i] = el.dataset.v === '1'; break;
    case 'reveal': ui.viewer = game.round.turn; ui.selBid = null; ui.selCard = null; break;
    case 'bid': {
      if (!myTurn()) return;
      const v = +el.dataset.v;
      // Tapping the already-selected number confirms it, like playing a card.
      if (ui.selBid === v) { act('confirmBid'); return; }
      ui.selBid = v; break;
    }
    case 'confirmBid': {
      if (ui.selBid == null || !myTurn()) return;
      const b = ui.selBid; ui.selBid = null;
      if (net.active && !net.isHost) { send(net.hostConn, { t: 'bid', b }); break; }
      Engine.placeBid(game, game.round.turn, b); afterChange(); break;
    }
    case 'card': {
      if (!myTurn()) return;
      const id = el.dataset.id;
      if (ui.selCard === id) { act('confirmCard'); return; }
      ui.selCard = id; break;
    }
    case 'confirmCard': {
      if (!ui.selCard || !myTurn()) return;
      const c = ui.selCard; ui.selCard = null;
      if (net.active && !net.isHost) { send(net.hostConn, { t: 'play', c }); break; }
      Engine.playCard(game, game.round.turn, c); afterChange(); break;
    }
    case 'continueTrick': if (net.active) return; Engine.continueTrick(game); save(); break;
    case 'skipBanner': if (net.active) return; advanceRound(); return;
    case 'playAgain':
      if (net.active) { if (net.isHost) hostAct('oBackLobby'); return; }
      startGame(game.names, game.order, game.bots || [], game.half); return;
    case 'mainMenu':
      if (net.active) { if (net.isHost) { hostAct('oEnd'); return; } clientLeave(); break; }
      clearTimers(); store.del(SAVE_KEY); game = null; ui.screen = 'home'; break;
    case 'settings': ui.modal = 'settings'; break;
    case 'setTheme': setTheme(el.dataset.v); break;
    case 'setLang': lang = el.dataset.v === 'et' ? 'et' : 'en'; store.set(LANG_KEY, lang); break;
    case 'setSound': if ((el.dataset.v === '1') !== Sfx.on) Sfx.toggle(); break;
    case 'newGame': clearTimers(); store.del(SAVE_KEY); game = null; ui.screen = 'setup'; break;
    default: return;
  }
  render();
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a;
  if (a === 'closeModalBg') { if (e.target === el) act('closeModal'); return; }
  e.preventDefault();
  act(a, el);
});
document.addEventListener('input', (e) => {
  if (e.target.matches('#setupForm input[data-i]')) ui.setup.names[+e.target.dataset.i] = e.target.value;
  if (e.target.id === 'onName') net.name = e.target.value;
  if (e.target.id === 'playerName') { net.name = e.target.value; store.set(NAME_KEY, net.name.trim().slice(0, 16)); }
  if (e.target.id === 'onCode') joinCode = normCode(e.target.value);
});
/* Update the avatar letter once the player finishes editing their name. */
document.addEventListener('change', (e) => { if (e.target.id === 'playerName' && ui.screen === 'player') render(); });
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'setupForm') return;
  e.preventDefault();
  startGame(playerNames(), ui.setup.order, ui.setup.bots, ui.setup.half);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.modal) { act('closeModal'); return; }
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.id === 'cover') { e.preventDefault(); act('reveal'); }
  if (e.key === 'Enter' && document.activeElement && (document.activeElement.id === 'onCode' || (document.activeElement.id === 'onName' && joinCode))) { e.preventDefault(); act('joinGo'); }
});
if (joinCode) ui.screen = 'online';
/* Seat positions depend on screen width (phone vs laptop), so redraw after a resize or rotation. */
let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (ui.screen === 'game') render(); }, 150); });
render();
/* A friend reopening their invite link gets their seat back without retyping anything. */
if (joinCode && net.name && store.get(tokenKey(joinCode))) clientJoin(joinCode);
