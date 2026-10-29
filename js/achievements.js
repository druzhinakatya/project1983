/* ============ ACHIEVEMENTS (kept per device; only human players on this device earn them) ============ */
const ACH_KEY = 'sitaratas.ach.v1';
const ACHS = [
  { id: 'spotOn', icon: '🎯' }, { id: 'zero', icon: '⭕' }, { id: 'sweep', icon: '🧹' }, { id: 'fire', icon: '🔥' },
  { id: 'inferno', icon: '🌋' }, { id: 'sharp', icon: '🏹' }, { id: 'flawless', icon: '💎' }, { id: 'underdog', icon: '🐭' },
  { id: 'trumpKill', icon: '⚔️' }, { id: 'champion', icon: '🏆' }, { id: 'comeback', icon: '📈' }, { id: 'escape', icon: '🗝️' },
  { id: 'sitaratas', icon: '🫠' }, { id: 'regular', icon: '🃏' },
  { id: 'nerves', icon: '🧊' }, { id: 'bigTalk', icon: '📣' }, { id: 'allIn', icon: '💯' }, { id: 'mindReader', icon: '🔮' },
  { id: 'wildfire', icon: '☄️' }, { id: 'domination', icon: '👑' }, { id: 'photoFinish', icon: '📸' }, { id: 'landslide', icon: '🏔️' },
  { id: 'halfHero', icon: '⏱️' }, { id: 'fullHouse', icon: '🏠' }, { id: 'robotSlayer', icon: '🤖' }, { id: 'veteran', icon: '🎖️' },
  { id: 'hoarder', icon: '💰' }, { id: 'overachiever', icon: '🚀' }, { id: 'repeatOffender', icon: '🔁' }
];
const achById = (id) => ACHS.find((a) => a.id === id);
const achText = (id) => (TEXT[lang].achT[id] || TEXT.en.achT[id]);
let achState = (() => { try { const s = JSON.parse(store.get(ACH_KEY)); if (s && s.u) return Object.assign({ count: 0, seen: [], points: 0, sitStreak: 0 }, s); } catch (e) {} return { u: {}, count: 0, seen: [], points: 0, sitStreak: 0 }; })();
function achSave() { store.set(ACH_KEY, JSON.stringify(achState)); }
function toast(html) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html; box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3600);
}
function achToast(id, who) {
  const a = achById(id); if (!a) return;
  const title = esc(achText(id)[0]);
  toast(who == null
    ? `<span class="toast-icon">${a.icon}</span><span><span class="label">${t('achUnlocked')}</span><b>${title}</b></span>`
    : `<span class="toast-icon">${a.icon}</span><span><span class="label">${esc(who)} ${t('achOther')}</span><b>${title}</b></span>`);
}
/* Seats whose achievements count on this device. */
function trackedSeats() {
  if (!game) return [];
  if (net.active) return net.mySeat != null ? [net.mySeat] : [];
  return humans();
}
function unlock(id, p) {
  if (achState.u[id]) return;
  achState.u[id] = Date.now(); achSave();
  Sfx.fx('chime');
  // On a shared device, say which player earned it.
  achToast(id, !net.active && trackedSeats().length > 1 ? game.names[p] : null);
  if (net.active) {
    if (net.isHost) hostAnnounceAch(p, id);
    else send(net.hostConn, { t: 'ach', id });
  }
}
function hostAnnounceAch(seat, id) {
  net.seats.forEach((s) => { if (s.kind === 'human' && s.peerId && net.conns[s.peerId]) send(net.conns[s.peerId], { t: 'achSeen', seat, id }); });
}
function trickAch(trick, trump, p) {
  const mine = trick.find((x) => x.p === p); if (!mine) return;
  const isT = Engine.suit(mine.c) === trump;
  if (isT && Engine.rank(mine.c) === 6) unlock('underdog', p);
  if (isT && trick.some((x) => x.p !== p && Engine.rank(x.c) === 14 && Engine.suit(x.c) !== trump)) unlock('trumpKill', p);
}
function cumulativeAfter(H, k, n) { const c = Array(n).fill(0); for (let i = 0; i < k; i++) H[i].points.forEach((x, j) => { c[j] += x; }); return c; }
/* Checks are safe to repeat: an achievement unlocks once and later checks skip it. */
function checkAchievements() {
  const seats = trackedSeats(); if (!seats.length) return;
  const H = game.history || [], r = game.round, n = game.names.length;
  for (const p of seats) {
    let run = 0, best = 0;
    H.forEach((h) => {
      const bid = h.bids[p], won = h.tricks[p], exact = bid === won;
      if (exact) unlock('spotOn', p);
      if (exact && bid === 0) unlock('zero', p);
      if (h.cards >= 4 && bid === h.cards && won === h.cards) unlock('sweep', p);
      if (h.cards >= 7 && bid === 0 && won === 0) unlock('nerves', p);
      if (exact && bid >= 6) unlock('bigTalk', p);
      if (h.cards >= 6 && bid === h.cards && won === h.cards) unlock('allIn', p);
      if (won - bid >= 3) unlock('overachiever', p);
      run = exact ? run + 1 : 0; best = Math.max(best, run);
    });
    if (best >= 5) unlock('sharp', p);
    if (best >= 10) unlock('mindReader', p);
    if (game.streak && game.streak.p === p) {
      if (game.streak.n >= 3) unlock('fire', p);
      if (game.streak.n >= 5) unlock('inferno', p);
      if (game.streak.n >= 7) unlock('wildfire', p);
    }
    if (r && r.phase === 'trickDone' && r.trickWinner === p) trickAch(r.trick, r.trump, p);
    if (r && r.lastTrick && r.lastTrick.winner === p) trickAch(r.lastTrick.trick, r.trump, p);
    if (game.over && H.length === game.schedule.length) {
      const first = Engine.ranking(game)[0], loser = Engine.sitaratas(game);
      if (first === p) unlock('champion', p);
      if (H.every((h) => h.bids[p] === h.tricks[p])) unlock('flawless', p);
      if (loser === p) unlock('sitaratas', p);
      const half = cumulativeAfter(H, Math.floor(H.length / 2), n);
      if (first === p && half[p] === Math.min(...half)) unlock('comeback', p);
      const late = cumulativeAfter(H, H.length - 3, n);
      if (late[p] === Math.min(...late) && loser !== p) unlock('escape', p);
      const order = Engine.ranking(game), myPlace = order.indexOf(p);
      if (first === p) {
        const margin = game.totals[p] - game.totals[order[1]];
        if (margin === 1) unlock('photoFinish', p);
        if (margin >= 30) unlock('landslide', p);
        if (game.half) unlock('halfHero', p);
        if (n === 6) unlock('fullHouse', p);
      }
      // Total domination: at the top of the scores (a shared top counts) after every single round.
      let top = true;
      for (let k = 1; k <= H.length && top; k++) { const c = cumulativeAfter(H, k, n); if (c[p] < Math.max(...c)) top = false; }
      if (top) unlock('domination', p);
      const botsBeaten = (game.bots || []).filter((isB, b) => isB && order.indexOf(b) > myPlace).length;
      if (botsBeaten >= 3) unlock('robotSlayer', p);
    }
  }
  if (game.over) {
    const gid = game.id || (game.names.join('|') + '|' + game.firstDealer + '|' + game.totals.join(','));
    if (!achState.seen.includes(gid)) {
      achState.seen = achState.seen.concat(gid).slice(-100); achState.count++;
      // Running totals for the long-term achievements (counted from this version on).
      achState.points += seats.reduce((s, p) => s + game.totals[p], 0);
      achState.sitStreak = seats.includes(Engine.sitaratas(game)) ? achState.sitStreak + 1 : 0;
      achSave();
      if (achState.count >= 10) unlock('regular', seats[0]);
      if (achState.count >= 50) unlock('veteran', seats[0]);
      if (achState.points >= 1000) unlock('hoarder', seats[0]);
      if (achState.sitStreak >= 3) unlock('repeatOffender', seats[0]);
    }
  }
}
/* Achievements section of the Player page: progress bar, then unlocked ones first, newest first. */
function achSection() {
  const got = ACHS.filter((a) => achState.u[a.id]).length;
  const loc = lang === 'et' ? 'et-EE' : 'en-GB';
  const sorted = ACHS.slice().sort((a, b) => (achState.u[b.id] || 0) - (achState.u[a.id] || 0));
  const cards = sorted.map((a) => {
    const [title, desc] = achText(a.id), d = achState.u[a.id];
    return `<div class="ach ${d ? 'got' : ''}"><span class="ach-icon" aria-hidden="true">${a.icon}</span>
      <div class="ach-body"><b>${esc(title)}</b><span class="hint">${esc(desc)}</span>
      ${d ? `<span class="ach-date">${new Date(d).toLocaleDateString(loc)}</span>` : `<span class="ach-locked">${t('achLocked')}</span>`}</div></div>`;
  }).join('');
  return `<section class="player-section" id="sec-ach">
    <div class="row" style="justify-content: space-between"><h2>${t('achievements')}</h2><b class="num">${t('achProgress', { n: got, t: ACHS.length })}</b></div>
    <div class="ach-bar"><i style="width:${(got / ACHS.length) * 100}%"></i></div>
    <div class="ach-grid">${cards}</div>
  </section>`;
}

