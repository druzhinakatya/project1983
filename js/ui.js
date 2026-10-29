/* ============ STATE + STORAGE ============ */
const SAVE_KEY = 'sitaratas.save.v1', LANG_KEY = 'sitaratas.lang';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
let lang = store.get(LANG_KEY) === 'et' ? 'et' : 'en';
let game = null;
try { const raw = store.get(SAVE_KEY); if (raw) game = JSON.parse(raw); } catch (e) { game = null; }
const BOT_DELAY = 800;
const ui = {
  screen: 'home', viewer: null, selCard: null, selBid: null, modal: null, bannerTimer: null, botTimer: null,
  bidBubbles: {}, seenRound: null, deal: null,
  setup: { count: 4, names: ['', '', '', '', '', ''], bots: [false, true, true, true, true, true], order: 'up', half: false }
};
if (game && game.names) {
  ui.setup.count = game.names.length;
  game.names.forEach((n, i) => { ui.setup.names[i] = n; ui.setup.bots[i] = !!(game.bots && game.bots[i]); });
  ui.setup.order = game.order;
  ui.setup.half = !!game.half;
}
const isBot = (p) => !!(game && game.bots && game.bots[p]);
const humans = () => (game ? game.names.map((_, i) => i).filter((i) => !isBot(i)) : []);
/* With one human at the table their hand stays visible; with several, the cover hides it between them. */
function resetViewer() { const h = humans(); ui.viewer = h.length === 1 ? h[0] : null; }
function needsCover() {
  const r = game && game.round;
  return !!r && (r.phase === 'bidding' || r.phase === 'playing') && !isBot(r.turn) && ui.viewer !== r.turn;
}
function clearTimers() { clearTimeout(ui.botTimer); ui.botTimer = null; clearTimeout(ui.bannerTimer); ui.bannerTimer = null; }
function save() { if (game) store.set(SAVE_KEY, JSON.stringify(game)); }

/* ============ HELPERS ============ */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function t(key, vars) {
  let s = TEXT[lang][key]; if (s == null) s = TEXT.en[key];
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
const SYM = { S: '♠', H: '♥', C: '♣', D: '♦' };
const isRed = (s) => s === 'H' || s === 'D';
const rankLabel = (r) => (r <= 10 ? String(r) : TEXT[lang].ranks[r]);
const cardText = (c) => rankLabel(Engine.rank(c)) + SYM[Engine.suit(c)];
function cardHTML(c, opts = {}) {
  const s = Engine.suit(c), r = Engine.rank(c);
  const cls = ['card', isRed(s) ? 'red' : '', opts.size || '', opts.cls || ''].join(' ');
  const corner = `${rankLabel(r)}<small>${SYM[s]}</small>`;
  const inner = `<span class="cr">${corner}</span><span class="cs" aria-hidden="true">${SYM[s]}</span><span class="cr cr2" aria-hidden="true">${corner}</span>`;
  const label = `${rankLabel(r)} ${TEXT[lang].suits[s]}`;
  const style = (opts.style ? ` style="${opts.style}"` : '') + (opts.id ? ` id="${opts.id}"` : '') + (opts.anim ? ` data-anim="${opts.anim}"` : '');
  if (opts.button) return `<button class="${cls}" data-a="card" data-id="${c}" ${opts.disabled ? 'disabled' : ''} aria-label="${esc(label)}"${style}>${inner}</button>`;
  return `<span class="${cls}" role="img" aria-label="${esc(label)}"${style}>${inner}</span>`;
}
const suitHTML = (s) => `<span class="suit-badge ${isRed(s) ? 'red' : ''}">${SYM[s]}</span>`;
const suitName = (s) => `${SYM[s]} ${TEXT[lang].suits[s]}`;
const defaultName = (i) => (ui.setup.bots[i] ? t('botN', { n: i + 1 }) : t('playerN', { n: i + 1 }));
const playerNames = () => ui.setup.names.slice(0, ui.setup.count).map((n, i) => n.trim() || defaultName(i));

/* ============ VIEWS ============ */
const menuOpt = (a, glyph, title, hint) => `<button class="opt" data-a="${a}"><span class="opt-glyph" aria-hidden="true">${glyph}</span><span class="opt-text"><b>${t(title)}</b><span class="hint">${t(hint)}</span></span><span class="opt-arrow" aria-hidden="true">→</span></button>`;
function homeView() {
  const fan = ['H14', 'S13', 'D12', 'C11'].map((c, i) => `<span style="transform: rotate(${(i - 1.5) * 7}deg)">${cardHTML(c)}</span>`).join('');
  const feats = [['+5', 'feat1T', 'feat1'], ['♣', 'feat2T', 'feat2'], ['↓', 'feat3T', 'feat3']]
    .map(([g, h, b]) => `<li><span class="feat-glyph">${g}</span><span><b>${t(h)}</b><br><span class="hint">${t(b)}</span></span></li>`).join('');
  return `<div class="home">
    <div class="home-copy">
      <div class="fan">${fan}</div>
      <div class="wordmark">Sitaratas<span class="dot">.</span></div>
      <p class="lede">${t('tagline')}</p>
      ${rejoinBanner()}
      ${game ? `<div class="row"><button class="btn primary big" data-a="continue">${t('continueGame')}</button></div>` : ''}
      <div class="menu-opts">
        ${menuOpt('toSetup', '▶', 'playOffline', 'playOfflineHint')}
        ${ONLINE_OK ? menuOpt('toHost', '+', 'hostGame', 'hostOptHint') + menuOpt('toJoin', '#', 'joinGame', 'joinOptHint') : ''}
      </div>
      <div class="linkrow">
        <button class="btn ghost" data-a="toPlayer">👤 ${t('player')} <span class="hint num">🏆 ${ACHS.filter((a) => achState.u[a.id]).length}/${ACHS.length}</span></button>
        <button class="btn ghost" data-a="rules">${t('rules')}</button>
      </div>
      <ul class="feats">${feats}</ul>
    </div>
    ${heroArt()}
  </div>`;
}
/* Decorative table scene: a trick where a low trump beats the ace, plus bid chips. */
function heroArt() {
  const trick = [['H10', 0, -1, -4], ['H14', 1, 0, 7], ['S7', 0, 1, 3, 'win'], ['H12', -1, 0, -8]]
    .map(([c, x, y, rot, win], i) => `<div class="art-card ${win || ''}" style="--x:${x};--y:${y};--r:${rot}deg;--i:${i}">${cardHTML(c, { size: 'xl' })}</div>`).join('');
  return `<div class="hero-art" aria-hidden="true">
    <div class="art-felt"></div>
    <div class="art-trick">${trick}</div>
    <div class="art-trump"><span class="label">${t('trump')}</span>${cardHTML('S9', { size: 'lg' })}</div>
    <div class="art-bids"><span>0</span><span>1</span><span class="x">2</span><span class="on">3</span><span>4</span></div>
  </div>`;
}
/* Game length picker (offline setup uses action 'half', the host lobby 'oHalf'). */
const lengthSeg = (action, half) => `<div class="seg">
  <button type="button" data-a="${action}" data-v="0" aria-pressed="${!half}">${t('fullGame')}</button>
  <button type="button" data-a="${action}" data-v="1" aria-pressed="${!!half}">${t('halfGame')}</button></div>`;
const orderLabel = (order, half) => (half ? (order === 'up' ? '1 → max' : 'max → 1') : t(order));
function setupView() {
  const s = ui.setup, n = s.count, m = Engine.maxHand(n), r = Engine.buildSchedule(n, s.order, s.half).length;
  const counts = [3, 4, 5, 6].map((k) => `<button type="button" data-a="count" data-v="${k}" aria-pressed="${k === n}">${k}</button>`).join('');
  const names = Array.from({ length: n }, (_, i) =>
    `<label><span class="seatno num">${i + 1}</span><input id="name-${i}" data-i="${i}" maxlength="16" value="${esc(s.names[i])}" placeholder="${esc(defaultName(i))}">
      <span class="seg kind"><button type="button" data-a="kind" data-i="${i}" data-v="0" aria-pressed="${!s.bots[i]}">${t('human')}</button><button type="button" data-a="kind" data-i="${i}" data-v="1" aria-pressed="${s.bots[i]}">${t('bot')}</button></span></label>`).join('');
  return `<div class="center-col">
    <div class="row" style="justify-content: space-between">
      <h1 style="font-size: 36px">${t('playOffline')}</h1>
      <button class="btn ghost" data-a="home">${t('back')}</button>
    </div>
    <form class="panel" id="setupForm">
      <div class="field"><span class="label">${t('players')}</span><div class="seg">${counts}</div></div>
      <div class="field"><div class="names">${names}</div><span class="hint">${t('seatHint')} ${t('seatHintBots')}</span></div>
      <div class="field"><span class="label">${t('gameLength')}</span>${lengthSeg('half', s.half)}</div>
      <div class="field"><span class="label">${t('roundOrder')}</span>
        <div class="seg">
          <button type="button" data-a="order" data-v="up" aria-pressed="${s.order === 'up'}">${orderLabel('up', s.half)}</button>
          <button type="button" data-a="order" data-v="down" aria-pressed="${s.order === 'down'}">${orderLabel('down', s.half)}</button>
        </div>
      </div>
      <div class="row" style="justify-content: space-between">
        <span class="hint num">${t('summary', { n, m, r })}</span>
        <button class="btn primary big" type="submit">${t('start')}</button>
      </div>
    </form>
  </div>`;
}

function topbar() {
  const r = game.round, total = game.schedule.length;
  const trumpPart = r.indicator
    ? `<span class="trumpval">${cardHTML(r.indicator, { size: 'sm' })}<span class="val">${suitName(r.trump)}</span></span>`
    : `<span class="trumpval">${suitHTML(r.trump)}<span class="val">${TEXT[lang].suits[r.trump]}</span><span class="hint wide-only">(${t('drawn')})</span></span>`;
  return `<header class="topbar">
    <span class="brand wide-only">Sitaratas</span>
    <div class="roundinfo">
      <div class="item"><span class="label">${t('round')}</span><span class="val num">${game.roundIdx + 1} / ${total}</span></div>
      <div class="item"><span class="label">${t('cardsLbl')}</span><span class="val num">${r.cards}</span></div>
      <div class="item wide-only"><span class="label">${t('dealer')}</span><span class="val">${esc(game.names[r.dealer])}</span></div>
      <div class="item"><span class="label">${t('trump')}</span>${trumpPart}</div>
      ${r.phase === 'bidding' ? '' : `<span class="bids-pill">${t('bidsPill', { b: Engine.bidSum(r), t: r.cards })}</span>`}
    </div>
    <span class="spacer"></span>
    ${net.active ? `<span class="react-bar">${REACTS.map((e) => `<button class="react-btn" data-a="react" data-v="${e}" aria-label="${e}">${e}</button>`).join('')}</span>` : ''}
    <button class="btn wide-only" data-a="lastTrick">${t('lastTrick')}</button>
    <button class="btn wide-only" data-a="sheet">${t('scoreSheet')}</button>
    <button class="btn" data-a="menu">${t('menu')}</button>
  </header>`;
}
/* After every trick: the winning card pops and the cards slide straight into the winner's plate.
   The only wait is for the last card to finish landing (its flight takes ~0.4 s).
   The game moves on (next trick, or the round summary) the moment the slide ends. */
const COLLECT_MS = 800;
const trickHold = () => 420;
/* ---- Round events seen on screen: new deals and new bids (works the same for host, friends and hotseat) ---- */
const BUBBLE_MS = 2400, DEAL_FLIGHT = 450, RESULT_MS = 2200;
/* The round summary window appears once: after the round that completes the first half of the game. */
const isHalfwayRound = () => !!game && game.history.length === Math.floor(game.schedule.length / 2);
function dealTiming(r, n) {
  const total = r.cards * n;
  const step = Math.min(110, 1600 / total);
  return { total, step, duration: (total - 1) * step + DEAL_FLIGHT };
}
function trackRoundEvents() {
  const r = game && game.round; if (!r) return;
  const key = (game.id || '') + ':' + game.roundIdx, now = Date.now();
  if (!ui.seenRound || ui.seenRound.key !== key) {
    // New round on screen: animate the deal only if nobody has bid yet (not when reopening a game mid-round).
    const fresh = r.phase === 'bidding' && r.bids.every((b) => b == null);
    ui.deal = fresh ? { key, at: now, ...dealTiming(r, game.names.length) } : null;
    ui.seenRound = { key, bids: r.bids.slice() };
    ui.bidBubbles = {};
    return;
  }
  r.bids.forEach((b, i) => {
    if (b != null && ui.seenRound.bids[i] == null) {
      ui.bidBubbles[i] = { v: b, at: now };
      setTimeout(() => { if (ui.bidBubbles[i] && Date.now() - ui.bidBubbles[i].at >= BUBBLE_MS) { delete ui.bidBubbles[i]; if (ui.screen === 'game') render(); } }, BUBBLE_MS + 50);
    }
  });
  ui.seenRound.bids = r.bids.slice();
}
const dealActive = () => ui.deal && Date.now() < ui.deal.at + ui.deal.duration;
function dealLayer(r, n, anchor) {
  if (!dealActive()) return '';
  const { at, total, step } = ui.deal, elapsed = Date.now() - at;
  let html = '';
  for (let k = 0; k < total; k++) {
    const seat = (r.dealer + 1 + (k % n)) % n;
    const p = seatPos(seat, n, anchor, 0.95);
    html += `<span class="dealcard" id="dc-${k}" data-anim="deal${at}" style="--x:${p.x}%;--y:${p.y}%;animation-delay:${Math.round(k * step - elapsed)}ms"></span>`;
  }
  return html;
}
/* Delay (ms from now) until the viewer's j-th card lands in their hand; null when no deal is playing. */
function handArrival(r, n, seat, j) {
  if (!dealActive()) return null;
  const k = j * n + ((seat - r.dealer - 1 + n) % n);
  return Math.round(k * ui.deal.step + DEAL_FLIGHT - (Date.now() - ui.deal.at));
}
/* 18 sparks spread evenly around the circle, alternating long/short throws and three colours. */
const BOOM_SPARKS = Array.from({ length: 18 }, (_, k) =>
  `<i style="--a:${k * 20 + (k % 2) * 7}deg;--d:${k % 2 ? 58 : 84}px;--c:var(--boom-${k % 3})"></i>`).join('');
/* Who sits at the bottom edge: you online, otherwise the player whose hand is showing. */
function tableAnchor() {
  if (net.active) return net.mySeat || 0;
  return ui.viewer != null ? ui.viewer : 0;
}
/* Position on the table oval. Play passes to the left, so the next seat is to the bottom player's left. k scales toward the centre. */
const isNarrow = () => window.innerWidth < 700;
function seatPos(i, n, anchor, k, forCard) {
  const d = (i - anchor + n) % n;
  const a = (90 + d * 360 / n) * Math.PI / 180;
  // Phones in portrait: a taller, narrower oval so side seats stay on screen,
  // and played cards pulled in toward the middle so they clear the side plates.
  const rx = isNarrow() ? (forCard ? 15 : 32) : 40, ry = isNarrow() ? 42 : 40;
  return { x: 50 + rx * k * Math.cos(a), y: 50 + ry * k * Math.sin(a) };
}
function tableScene() {
  const r = game.round, n = game.names.length, anchor = tableAnchor();
  const plates = game.names.map((nm, i) => {
    const p = seatPos(i, n, anchor, 1);
    const bid = r.bids[i], tr = r.tricks[i];
    let state = '';
    if (bid != null && r.phase !== 'bidding') state = tr > bid ? 'over' : tr === bid ? 'made' : '';
    const react = net.reacts[i];
    const me = net.active && i === net.mySeat;
    const chips = (isBot(i) ? `<span class="chip accent">${t('bot')}</span>` : '')
      + (!seatConnected(i) ? `<span class="chip warn">${t('offline')}</span>` : '')
      + (r.dealer === i ? `<span class="chip"><span class="wide-only">${t('dealer')}</span><span class="narrow-only" title="${esc(t('dealer'))}">D</span></span>` : '');
    const won = r.phase === 'trickDone' && r.trickWinner === i;
    const streak = game.streak && game.streak.p === i && game.streak.n >= 3 ? game.streak.n : 0;
    const bub = ui.bidBubbles[i];
    const bubble = bub && Date.now() - bub.at < BUBBLE_MS
      ? `<span class="bid-bubble ${p.y < 50 ? 'below' : ''}" data-anim="bb${bub.at}" style="animation-delay:${-(Date.now() - bub.at)}ms">${t('bid')} <b>${bub.v}</b></span>` : '';
    // Round just ended: green if the bid was hit exactly, red if missed, with the round's points.
    const lastH = r.phase === 'roundDone' ? game.history[game.history.length - 1] : null;
    const result = lastH ? (lastH.bids[i] === lastH.tricks[i] ? 'res-made' : 'res-miss') : '';
    const resChip = lastH ? `<span class="res-pts">+${lastH.points[i]}</span>` : '';
    // A bold bid (4 or more tricks) hit exactly gets an explosion over the plate.
    const boom = lastH && lastH.bids[i] > 3 && lastH.bids[i] === lastH.tricks[i]
      ? `<div class="boom" id="boom-${i}" data-anim="boom${game.history.length}" style="left:${p.x}%;top:${p.y}%" aria-hidden="true"><b></b><b></b>${BOOM_SPARKS}</div>` : '';
    return `${boom}<div class="plate ${r.turn === i ? 'turn' : ''} ${won ? 'won' : ''} ${streak ? 'fire' : ''} ${result} ${state}" id="plate-${i}" style="left:${p.x}%;top:${p.y}%" ${streak ? `title="${esc(t('onFire', { n: streak }))}"` : ''}>
      ${bubble}
      ${react ? `<span class="react-bubble" data-anim="rb${react.at}" aria-hidden="true">${react.e}</span>` : ''}
      <div class="plate-top"><span class="seat-name">${esc(nm)}${me ? ` <span class="hint">(${t('you')})</span>` : ''}</span>${chips}${resChip}</div>
      <div class="plate-stats num">
        <span><span class="label"><span class="wide-only">${t('bid')}</span><span class="narrow-only">${t('bidS')}</span></span> <b>${bid == null ? '–' : bid}</b></span>
        <span><span class="label"><span class="wide-only">${t('tricks')}</span><span class="narrow-only">${t('wonS')}</span></span> <b class="tricks-val">${tr}</b></span>
        <span><span class="label"><span class="wide-only">${t('score')}</span><span class="narrow-only">${t('ptsS')}</span></span> <b>${game.totals[i]}</b></span>
      </div>
    </div>`;
  }).join('');
  const done = r.phase === 'trickDone';
  const wp = done ? seatPos(r.trickWinner, n, anchor, 1) : null;
  // Remember when this trick finished so a redraw continues the slide instead of restarting it.
  let holdLeft = trickHold();
  if (done) {
    const key = game.roundIdx + ':' + r.tricks.reduce((a, b) => a + b, 0);
    if (!ui.trickAnim || ui.trickAnim.key !== key) ui.trickAnim = { key, at: Date.now() };
    holdLeft = trickHold() - (Date.now() - ui.trickAnim.at);
  }
  const played = r.trick.map((x, k) => {
    const p = seatPos(x.p, n, anchor, isNarrow() ? 0.44 : 0.52, true);
    const rot = ((x.p * 37 + k * 11) % 13) - 6;
    const win = done && x.p === r.trickWinner;
    const toWinner = wp ? `;--wx:${wp.x}%;--wy:${wp.y}%;--hold:${holdLeft}ms;--collect:${COLLECT_MS}ms` : '';
    return `<div class="tcard ${win ? 'win' : ''} ${done ? 'collect' : ''}" id="tc-${x.c}" data-p="${x.p}" data-anim="${done ? 'collect' + ui.trickAnim.at : 'play'}" style="left:${p.x}%;top:${p.y}%;--r:${rot}deg${toWinner}">${cardHTML(x.c, { cls: Engine.suit(x.c) === r.trump ? 'trumpcard' : '' })}</div>`;
  }).join('');
  let center;
  const tapToContinue = false;
  if (r.phase === 'bidding') {
    const big = r.indicator ? cardHTML(r.indicator, { size: 'lg' }) : `<span class="suit-badge ${isRed(r.trump) ? 'red' : ''}" style="font-size:64px">${SYM[r.trump]}</span>`;
    center = `<span class="label">${t('trump')}</span>${big}
      <div class="table-status">${suitName(r.trump)}${r.indicator ? '' : ` <span class="hint">(${t('drawn')})</span>`}</div>
      <div class="table-sub">${t('waitingBid', { name: esc(game.names[r.turn]) })}</div>`;
  } else if (r.phase === 'roundDone') {
    center = `<div class="table-status">${t('roundComplete', { i: game.history.length })}</div>
      <div class="table-sub">${game.history.length >= game.schedule.length ? t('lastOnline') : t('dealingNext')}</div>`;
  } else if (r.phase === 'trickDone') {
    center = `<div class="table-status">${t('winsTrick', { name: esc(game.names[r.trickWinner]) })}</div>`;
  } else {
    center = `<div class="table-status">${r.trick.length ? t('toPlay', { name: esc(game.names[r.turn]) }) : t('leads', { name: esc(game.names[r.turn]) })}</div>`;
  }
  return `<section class="tablewrap ${n >= 5 ? 'many' : ''} ${tapToContinue ? 'continue' : ''}" ${tapToContinue ? 'data-a="continueTrick"' : ''}>
    <div class="felt"></div>
    ${dealLayer(r, n, anchor)}
    ${played}
    <div class="felt-center ph-${r.phase}">${center}</div>
    ${plates}
  </section>`;
}
function dockView() {
  const r = game.round;
  const actor = r.turn;
  // While the deal animation plays, each of your cards appears as its card back reaches your seat.
  const arrive = (seat, j) => { const d = handArrival(r, game.names.length, seat, j); return d == null ? {} : { style: `animation-delay:${d}ms`, extra: ' dealt-in', anim: 'deal' + ui.deal.at }; };
  const watchHand = () => {
    if (ui.viewer == null || (!net.active && humans().length !== 1)) return '<div class="waiting">&nbsp;</div>';
    const cards = Engine.sortHand(r.hands[ui.viewer], r.trump).map((c, j) => { const a = arrive(ui.viewer, j); return cardHTML(c, { cls: (Engine.suit(c) === r.trump ? 'trumpcard' : '') + (a.extra || ''), style: a.style, anim: a.anim, id: 'hc-' + c }); }).join('');
    return `<div class="dock-head"><h3>${esc(game.names[ui.viewer])}</h3><span class="hint">${t('yourHand')}</span></div><div class="hand static" style="--count:${r.hands[ui.viewer].length}">${cards}</div>`;
  };
  if (actor != null && isBot(actor)) return `<section class="dock"><div class="hint"><b>${esc(game.names[actor])}</b> ${t('thinking')}</div>${watchHand()}</section>`;
  if (actor != null && net.active && ui.viewer !== actor) return `<section class="dock"><div class="hint">${t('waitingPlayer', { name: `<b>${esc(game.names[actor])}</b>` })}</div>${watchHand()}</section>`;
  if (actor == null || ui.viewer !== actor) return `<section class="dock">${watchHand()}</section>`;
  const hand = Engine.sortHand(r.hands[actor], r.trump);
  if (r.phase === 'bidding') {
    const f = Engine.forbiddenBid(r, actor);
    const btns = [];
    for (let b = 0; b <= r.cards; b++) btns.push(`<button class="bidbtn" data-a="bid" data-v="${b}" ${b === f ? 'disabled' : ''} aria-pressed="${ui.selBid === b}">${b}</button>`);
    const handHTML = hand.map((c, j) => { const a = arrive(actor, j); return cardHTML(c, { cls: (Engine.suit(c) === r.trump ? 'trumpcard' : '') + (a.extra || ''), style: a.style, anim: a.anim, id: 'hc-' + c }); }).join('');
    return `<section class="dock">
      <div class="hand" style="--count:${hand.length}">${handHTML}</div>
      <div class="bidrow"><div class="bids">${btns.join('')}</div><span class="bids-pill">${t('bidsPill', { b: Engine.bidSum(r), t: r.cards })}</span></div>
      ${f != null ? `<div class="forbid">${t('forbidden', { f, t: r.cards })}</div>` : ''}
      <button class="btn primary big" data-a="confirmBid" ${ui.selBid == null ? 'disabled' : ''}>${ui.selBid == null ? t('chooseBid') : t('confirmBid', { n: ui.selBid })}</button>
    </section>`;
  }
  const info = Engine.legalInfo(r, actor), led = Engine.ledSuit(r);
  const hint = info.reason === 'any' ? t('hintAny')
    : info.reason === 'follow' ? t('hintFollow', { s: suitName(led) })
    : info.reason === 'trump' ? t('hintTrump', { led: SYM[led], s: suitName(r.trump) })
    : t('hintFree', { led: SYM[led] });
  const handHTML = hand.map((c) => cardHTML(c, { button: true, disabled: !info.cards.includes(c), id: 'hc-' + c,
    cls: (Engine.suit(c) === r.trump ? 'trumpcard ' : '') + (ui.selCard === c ? 'sel' : '') })).join('');
  return `<section class="dock">
    <div class="dock-head"><h3>${esc(game.names[actor])}</h3><span class="hint">${hint}</span></div>
    <div class="hand" style="--count:${hand.length}">${handHTML}</div>
    <button class="btn primary big" data-a="confirmCard" ${ui.selCard ? '' : 'disabled'}>${ui.selCard ? t('playBtn', { c: cardText(ui.selCard) }) : t('chooseCard')}</button>
  </section>`;
}
function coverView() {
  const r = game.round, nm = esc(game.names[r.turn]);
  return `<div class="overlay cover" data-a="reveal" role="button" tabindex="0" id="cover">
    <div class="cover-inner">
      <span class="label">${t('round')} ${game.roundIdx + 1} / ${game.schedule.length}</span>
      <h2>${t('turnOf', { name: nm })}</h2>
      <div class="what">${r.phase === 'bidding' ? t('coverBid') : t('coverPlay')}</div>
      <p>${t('coverTap', { name: nm })}</p>
    </div>
  </div>`;
}
function bannerView() {
  const h = game.history[game.history.length - 1], i = game.history.length;
  const rows = game.names.map((nm, p) => {
    const made = h.bids[p] === h.tricks[p];
    return `<tr><td>${esc(nm)}</td><td class="n">${h.bids[p]}</td><td class="n">${h.tricks[p]}</td>
      <td class="n">${made ? `<span class="tag-made">+${h.points[p]} ✓</span>` : '+' + h.points[p]}</td><td class="n"><b>${game.totals[p]}</b></td></tr>`;
  }).join('');
  const last = game.roundIdx + 1 >= game.schedule.length;
  const hint = net.active ? (last ? t('lastOnline') : t('nextOnline')) : (last ? t('lastRoundNext') : t('next'));
  return `<div class="overlay" ${net.active ? '' : 'data-a="skipBanner" style="cursor:pointer"'}>
    <div class="modal banner">
      <span class="label">${t('halfway')}</span>
      <h2>${t('roundResult', { i })}</h2>
      <table class="results"><thead><tr><th></th><th class="n">${t('bid')}</th><th class="n">${t('tricks')}</th><th class="n">+</th><th class="n">${t('total')}</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="bar"><i></i></div>
      <span class="hint">${hint}</span>
    </div>
  </div>`;
}
function sheetTable() {
  const n = game.names.length;
  const head = `<tr><th class="rn">${t('round')}</th><th>${t('cardsLbl')}</th><th>${t('trump')}</th>${game.names.map((nm) => `<th>${esc(nm)}</th>`).join('')}</tr>`;
  const rows = game.schedule.map((cards, i) => {
    const h = game.history[i];
    const current = !game.over && i === game.roundIdx;
    let trumpCell = '', cells = '';
    if (h) {
      trumpCell = suitHTML(h.trump);
      for (let p = 0; p < n; p++) {
        const made = h.bids[p] === h.tricks[p];
        cells += `<td class="cell ${made ? 'made' : ''}"><small>${h.bids[p]}/${h.tricks[p]}</small><b>${h.points[p]}</b></td>`;
      }
    } else if (current && game.round) {
      trumpCell = suitHTML(game.round.trump);
      for (let p = 0; p < n; p++) {
        const b = game.round.bids[p];
        cells += `<td class="cell"><small>${b == null ? '–' : b}/${game.round.phase === 'bidding' ? '–' : game.round.tricks[p]}</small></td>`;
      }
    } else for (let p = 0; p < n; p++) cells += '<td class="cell"></td>';
    return `<tr class="${current ? 'current' : h ? '' : 'future'}"><td class="rn num">${i + 1}</td><td>${cards}</td><td>${trumpCell}</td>${cells}</tr>`;
  }).join('');
  const foot = `<tr><td class="rn" colspan="3">${t('total')}</td>${game.totals.map((x) => `<td class="cell">${x}</td>`).join('')}</tr>`;
  return `<div class="sheet-wrap"><table class="sheet"><thead>${head}</thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table></div>`;
}
function modalView() {
  if (ui.modal === 'settings') return settingsModal();
  const close = `<button class="btn ghost" data-a="closeModal">${t('close')}</button>`;
  if (ui.modal === 'rules') return `<div class="overlay" data-a="closeModalBg"><div class="modal"><div class="modal-head"><h2>${t('rules')}</h2>${close}</div>
    <ol class="rules">${TEXT[lang].rulesList.map((x) => `<li>${x}</li>`).join('')}</ol></div></div>`;
  if (ui.modal === 'sheet') return `<div class="overlay" data-a="closeModalBg"><div class="modal wide"><div class="modal-head"><h2>${t('scoreSheet')}</h2>${close}</div>
    <span class="hint">${t('bid')}/${t('tricks')} · ${t('score')}</span>${sheetTable()}</div></div>`;
  if (ui.modal === 'menu') return `<div class="overlay" data-a="closeModalBg"><div class="modal"><div class="modal-head"><h2>${t('menu')}</h2>${close}</div>
    <div class="menu-list">
      <button class="btn phone-only" data-a="sheet">${t('scoreSheet')}</button>
      ${game && game.round ? `<button class="btn phone-only" data-a="lastTrick">${t('lastTrick')}</button>` : ''}
      <button class="btn" data-a="rules">${t('rules')}</button>
      <button class="btn" data-a="settings">⚙️ ${t('settings')}</button>
      <button class="btn danger" data-a="abandonAsk">${!net.active ? t('abandon') : net.isHost ? t('endForAll') : t('leave')}</button>
    </div></div></div>`;
  if (ui.modal === 'abandon') {
    const [q, body, yes] = !net.active ? [t('abandonQ'), t('abandonBody'), t('abandon')]
      : net.isHost ? [t('endForAll') + '?', t('endForAllBody'), t('endForAll')] : [t('leaveQ'), t('leaveBody'), t('leave')];
    return `<div class="overlay" data-a="closeModalBg"><div class="modal"><h2>${q}</h2><p class="hint" style="margin:0">${body}</p>
    <div class="row"><button class="btn primary" data-a="closeModal">${t('keepPlaying')}</button><button class="btn danger" data-a="abandonYes">${yes}</button></div></div></div>`;
  }
  if (ui.modal === 'lastTrick') {
    const lt = game.round && game.round.lastTrick;
    const body = lt ? `<div class="trick">${lt.trick.map((x) => `<div class="played ${x.p === lt.winner ? 'win' : ''}">${cardHTML(x.c, { cls: Engine.suit(x.c) === game.round.trump ? 'trumpcard' : '' })}<span class="who">${esc(game.names[x.p])}</span></div>`).join('')}</div>
      <div class="table-status">${t('winsTrick', { name: esc(game.names[lt.winner]) })}</div>` : `<p class="hint">${t('noLastTrick')}</p>`;
    return `<div class="overlay" data-a="closeModalBg"><div class="modal"><div class="modal-head"><h2>${t('lastTrick')}</h2>${close}</div>${body}</div></div>`;
  }
  return '';
}
function endView() {
  const order = Engine.ranking(game), loser = Engine.sitaratas(game);
  const rows = order.map((p, k) => `<div class="rankrow ${p === loser ? 'loser' : ''}">
    <span class="place num">${k + 1}</span>
    <span class="nm">${esc(game.names[p])}${p === loser ? `<span class="loser-badge">${t('sitaratas')}</span>` : ''}</span>
    <span class="tot">${game.totals[p]}</span></div>`).join('');
  return `<div class="end">
    <div class="row"><span class="label">${t('finalResults')}</span></div>
    <div class="verdict">${t('isSitaratas', { name: esc(game.names[loser]) })}</div>
    <div class="ranks">${rows}</div>
    <div class="row">${net.active && !net.isHost
      ? `<span class="hint">${t('waitHostAgain')}</span><button class="btn big" data-a="mainMenu">${t('leave')}</button>`
      : `<button class="btn primary big" data-a="playAgain">${net.active ? t('backToLobby') : t('playAgain')}</button><button class="btn big" data-a="mainMenu">${net.active ? t('endForAll') : t('mainMenu')}</button>`}</div>
    <h2 style="font-size: 22px">${t('scoreSheet')}</h2>
    ${sheetTable()}
  </div>`;
}

/* ============ THEME ============ */
const THEME_KEY = 'sitaratas.theme';
let themeMode = store.get(THEME_KEY); // 'light' | 'dark' | null (follow system)
const prefersDark = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; } };
const isDark = () => (themeMode ? themeMode === 'dark' : prefersDark());
function applyTheme() { if (themeMode) document.documentElement.setAttribute('data-theme', themeMode); else document.documentElement.removeAttribute('data-theme'); }
/* mode: 'light' | 'dark' | 'auto' (follow the device) */
function setTheme(mode) { themeMode = mode === 'auto' ? null : mode; if (themeMode) store.set(THEME_KEY, themeMode); else store.del(THEME_KEY); applyTheme(); }
applyTheme();
/* Small gear in the top corner that opens the Settings panel. */
function settingsButton() {
  const gear = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  return `<button class="theme-toggle" data-a="settings" aria-label="${esc(t('settings'))}" title="${esc(t('settings'))}">${gear}</button>`;
}
function settingsModal() {
  const seg = (action, opts, current) => `<div class="seg">${opts.map(([v, label]) =>
    `<button type="button" data-a="${action}" data-v="${v}" aria-pressed="${v === current}">${label}</button>`).join('')}</div>`;
  return `<div class="overlay" data-a="closeModalBg"><div class="modal settings">
    <div class="modal-head"><h2>${t('settings')}</h2><button class="btn ghost" data-a="closeModal">${t('close')}</button></div>
    <div class="setting"><span class="setting-name">🔊 ${t('soundLbl')}</span>${seg('setSound', [['0', t('off')], ['1', t('on')]], Sfx.on ? '1' : '0')}</div>
    <div class="setting"><span class="setting-name">🌐 ${t('languageLbl')}</span>${seg('setLang', [['en', 'English'], ['et', 'Eesti']], lang)}</div>
    <div class="setting"><span class="setting-name">🌓 ${t('appearance')}</span>${seg('setTheme', [['light', t('light')], ['dark', t('dark')], ['auto', t('auto')]], themeMode || 'auto')}</div>
  </div></div>`;
}

