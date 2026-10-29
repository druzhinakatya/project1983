/* ============ ENGINE START (pure rules, no DOM) ============ */
const Engine = (() => {
  const SUITS = ['S', 'H', 'C', 'D'];
  const rand = (n) => {
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
    catch (e) { return Math.floor(Math.random() * n); }
  };
  const suit = (c) => c[0];
  const rank = (c) => +c.slice(1);
  const maxHand = (n) => Math.floor(36 / n);

  /* half: play only the first leg (1 → max, or max → 1), ending on the repeated turning-point rounds. */
  function buildSchedule(n, order, half) {
    const m = maxHand(n);
    const up = []; for (let c = 2; c < m; c++) up.push(c);
    const down = up.slice().reverse();
    const ones = Array(n).fill(1), maxes = Array(n).fill(m);
    if (half) return order === 'up' ? [...ones, ...up, ...maxes] : [...maxes, ...down, ...ones];
    return order === 'up'
      ? [...ones, ...up, ...maxes, ...down, ...ones]
      : [...maxes, ...down, ...ones, ...up, ...maxes];
  }
  function makeDeck() { const d = []; for (const s of SUITS) for (let r = 6; r <= 14; r++) d.push(s + r); return d; }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function newGame(names, order, half) {
    const n = names.length;
    if (n < 3 || n > 6) throw new Error('3–6 players');
    const g = { v: 1, id: Math.random().toString(36).slice(2) + Date.now().toString(36), names: names.slice(), order, half: !!half, schedule: buildSchedule(n, order, half), firstDealer: rand(n),
      roundIdx: 0, totals: Array(n).fill(0), history: [], over: false, round: null };
    startRound(g);
    return g;
  }
  function startRound(g) {
    const n = g.names.length, cards = g.schedule[g.roundIdx], dealer = (g.firstDealer + g.roundIdx) % n;
    const deck = shuffle(makeDeck());
    const hands = Array.from({ length: n }, () => []);
    let k = 0;
    for (let c = 0; c < cards; c++) for (let i = 1; i <= n; i++) hands[(dealer + i) % n].push(deck[k++]);
    const rest = deck.slice(k);
    const indicator = rest.length ? rest[rand(rest.length)] : null;
    const trump = indicator ? suit(indicator) : SUITS[rand(4)];
    g.round = { cards, dealer, hands, indicator, trump, bids: Array(n).fill(null), tricks: Array(n).fill(0),
      phase: 'bidding', turn: (dealer + 1) % n, trick: [], lastTrick: null, trickWinner: null };
  }
  function bidSum(r) { return r.bids.reduce((s, b) => s + (b == null ? 0 : b), 0); }
  function forbiddenBid(r, p) {
    if (p !== r.dealer) return null;
    let s = 0; r.bids.forEach((b, i) => { if (i !== p && b != null) s += b; });
    const f = r.cards - s;
    return f >= 0 ? f : null;
  }
  function placeBid(g, p, b) {
    const r = g.round, n = g.names.length;
    if (!r || r.phase !== 'bidding' || r.turn !== p) throw new Error('Not this player\'s turn to bid');
    if (!Number.isInteger(b) || b < 0 || b > r.cards || b === forbiddenBid(r, p)) throw new Error('Illegal bid');
    r.bids[p] = b;
    if (p === r.dealer) { r.phase = 'playing'; r.turn = (r.dealer + 1) % n; }
    else r.turn = (p + 1) % n;
  }
  function ledSuit(r) { return r.trick.length ? suit(r.trick[0].c) : null; }
  /* Returns {cards, reason}: reason is 'any' | 'follow' | 'trump' | 'free' */
  function legalInfo(r, p) {
    const h = r.hands[p], led = ledSuit(r);
    if (!led) return { cards: h.slice(), reason: 'any' };
    const f = h.filter((c) => suit(c) === led);
    if (f.length) return { cards: f, reason: 'follow' };
    const t = h.filter((c) => suit(c) === r.trump);
    if (t.length) return { cards: t, reason: 'trump' };
    return { cards: h.slice(), reason: 'free' };
  }
  function trickWinner(trick, trump) {
    const led = suit(trick[0].c);
    const tr = trick.filter((x) => suit(x.c) === trump);
    const pool = tr.length ? tr : trick.filter((x) => suit(x.c) === led);
    let best = pool[0];
    for (const x of pool) if (rank(x.c) > rank(best.c)) best = x;
    return best.p;
  }
  function playCard(g, p, c) {
    const r = g.round, n = g.names.length;
    if (!r || r.phase !== 'playing' || r.turn !== p) throw new Error('Not this player\'s turn to play');
    if (!legalInfo(r, p).cards.includes(c)) throw new Error('Illegal card');
    r.hands[p].splice(r.hands[p].indexOf(c), 1);
    r.trick.push({ p, c });
    if (r.trick.length === n) {
      const w = trickWinner(r.trick, r.trump);
      r.tricks[w]++; r.trickWinner = w; r.phase = 'trickDone'; r.turn = null;
      // Consecutive tricks won by the same player, across rounds; anyone else winning resets it.
      g.streak = g.streak && g.streak.p === w ? { p: w, n: g.streak.n + 1 } : { p: w, n: 1 };
    } else r.turn = (p + 1) % n;
  }
  const points = (bid, t) => t + (t === bid ? 5 : 0);
  function continueTrick(g) {
    const r = g.round;
    if (!r || r.phase !== 'trickDone') return;
    const w = r.trickWinner;
    r.lastTrick = { trick: r.trick, winner: w };
    r.trick = []; r.trickWinner = null;
    if (r.hands.every((h) => h.length === 0)) {
      const pts = r.bids.map((b, i) => points(b, r.tricks[i]));
      pts.forEach((x, i) => { g.totals[i] += x; });
      g.history.push({ cards: r.cards, dealer: r.dealer, trump: r.trump, indicator: r.indicator,
        bids: r.bids.slice(), tricks: r.tricks.slice(), points: pts });
      r.phase = 'roundDone'; r.turn = null;
    } else { r.phase = 'playing'; r.turn = w; }
  }
  function nextRound(g) {
    if (!g.round || g.round.phase !== 'roundDone') return;
    g.roundIdx++;
    if (g.roundIdx >= g.schedule.length) { g.over = true; g.round = null; }
    else startRound(g);
  }
  /* Highest score first; ties go to the earlier seat. */
  function ranking(g) { return g.names.map((_, i) => i).sort((a, b) => g.totals[b] - g.totals[a] || a - b); }
  /* Lowest score; on a tie the earlier seat is the Sitaratas. */
  function sitaratas(g) { const m = Math.min(...g.totals); return g.totals.indexOf(m); }
  function sortHand(h, trump) {
    const order = [trump, ...SUITS.filter((s) => s !== trump)];
    return h.slice().sort((a, b) => order.indexOf(suit(a)) - order.indexOf(suit(b)) || rank(a) - rank(b));
  }
  return { SUITS, suit, rank, maxHand, buildSchedule, newGame, startRound, bidSum, forbiddenBid, placeBid,
    legalInfo, trickWinner, playCard, continueTrick, nextRound, points, ranking, sitaratas, sortHand, ledSuit };
})();
/* ============ ENGINE END ============ */
