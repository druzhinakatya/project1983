/* ============ PLAYER STATS (per device, like achievements; only humans on this device count) ============ */
const STATS_KEY = 'sitaratas.stats.v1';
const freshStats = () => ({ games: 0, wins: 0, sitaratas: 0, rounds: 0, exact: 0, bestStreak: 0, highScore: 0, points: 0, seenRounds: [], seenGames: [] });
let stats = (() => { try { const s = JSON.parse(store.get(STATS_KEY)); if (s && typeof s.games === 'number') return Object.assign(freshStats(), s); } catch (e) {} return freshStats(); })();
function saveStats() { store.set(STATS_KEY, JSON.stringify(stats)); }
function resetStats() { stats = freshStats(); saveStats(); }
/* Safe to call on every update: each round and each finished game is counted once. */
function trackStats() {
  const seats = trackedSeats(); if (!seats.length || !game) return;
  const gid = game.id || (game.names.join('|') + '|' + game.firstDealer);
  let changed = false;
  game.history.forEach((h, idx) => {
    const k = gid + ':' + idx;
    if (stats.seenRounds.includes(k)) return;
    stats.seenRounds.push(k); changed = true;
    seats.forEach((p) => { stats.rounds++; if (h.bids[p] === h.tricks[p]) stats.exact++; });
  });
  if (game.streak && seats.includes(game.streak.p) && game.streak.n > stats.bestStreak) { stats.bestStreak = game.streak.n; changed = true; }
  if (game.over && !stats.seenGames.includes(gid)) {
    stats.seenGames.push(gid); changed = true;
    const first = Engine.ranking(game)[0], loser = Engine.sitaratas(game);
    seats.forEach((p) => {
      stats.games++; stats.points += game.totals[p];
      if (first === p) stats.wins++;
      if (loser === p) stats.sitaratas++;
      stats.highScore = Math.max(stats.highScore, game.totals[p]);
    });
  }
  if (changed) {
    stats.seenRounds = stats.seenRounds.slice(-400); stats.seenGames = stats.seenGames.slice(-100);
    saveStats();
  }
}
function statsSection() {
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const tiles = [
    ['🃏', stats.games, t('stGames')],
    ['🏆', stats.wins, t('stWins'), pct(stats.wins, stats.games)],
    ['🫠', stats.sitaratas, t('stSitaratas'), pct(stats.sitaratas, stats.games)],
    ['🎯', stats.exact + ' / ' + stats.rounds, t('stExact'), pct(stats.exact, stats.rounds)],
    ['🔥', stats.bestStreak, t('stStreak')],
    ['⭐', stats.highScore, t('stHigh')],
    ['∅', stats.games ? Math.round(stats.points / stats.games) : '–', t('stAvg')]
  ].map(([icon, big, label, sub]) => `<div class="stat"><span class="stat-icon" aria-hidden="true">${icon}</span>
    <div><b class="num">${big}</b>${sub ? ` <span class="stat-sub num">${sub}</span>` : ''}<span class="hint">${label}</span></div></div>`).join('');
  const reset = ui.statsReset
    ? `<span class="hint">${t('stResetQ')}</span><button class="btn danger sm" data-a="statsResetYes">${t('stResetYes')}</button><button class="btn sm" data-a="statsResetNo">${t('cancel')}</button>`
    : `<button class="btn ghost sm" data-a="statsResetAsk">${t('stReset')}</button>`;
  return `<section class="player-section" id="sec-stats">
    <h2>${t('stats')}</h2>
    <div class="stat-grid">${tiles}</div>
    <div class="row">${reset}</div>
  </section>`;
}
/* The Player page: who you are on this device, your stats, and your achievements. */
function playerView() {
  const got = ACHS.filter((a) => achState.u[a.id]).length;
  const summary = t('playerSummary', { g: stats.games, w: stats.wins, a: got, t: ACHS.length });
  const name = net.name.trim();
  const initial = name ? esc(name[0].toUpperCase()) : '🃏';
  return `<div class="center-col ach-page player-page">
    <div class="row" style="justify-content: space-between">
      <h1 style="font-size: 36px">${t('player')}</h1>
      <button class="btn ghost" data-a="home">${t('back')}</button>
    </div>
    <div class="profile">
      <span class="av avatar" style="background:var(--accent)" aria-hidden="true">${initial}</span>
      <div class="profile-body">
        <label class="label" for="playerName">${t('yourName')}</label>
        <input class="text-in profile-name" id="playerName" maxlength="16" value="${esc(net.name)}" placeholder="${esc(t('namePlaceholder'))}" autocomplete="nickname">
        <span class="hint num">${summary}</span>
      </div>    </div>
    <div class="player-tabs seg">
      <button type="button" data-a="playerTab" data-v="stats" aria-pressed="${ui.playerTab !== 'ach'}">📊 ${t('stats')}</button>
      <button type="button" data-a="playerTab" data-v="ach" aria-pressed="${ui.playerTab === 'ach'}">🏆 ${t('achievements')} <span class="num">${got}/${ACHS.length}</span></button>
    </div>
    ${ui.playerTab === 'ach' ? achSection() : statsSection()}
    <span class="hint">${t('playerHint')}</span>
  </div>`;
}

