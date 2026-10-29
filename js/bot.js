/* ============ BOT (level 2: rules of thumb, sees only its own hand + public info) ============ */
const Bot = (() => {
  const { suit, rank } = Engine;
  const asc = (a, b) => rank(a) - rank(b);
  const low = (arr) => arr.slice().sort(asc)[0];
  const high = (arr) => arr.slice().sort(asc)[arr.length - 1];

  /* Expected tricks from the hand alone. */
  function estimate(r, p) {
    const hand = r.hands[p], n = r.hands.length, T = r.trump;
    const by = { S: [], H: [], C: [], D: [] };
    hand.forEach((c) => by[suit(c)].push(rank(c)));
    for (const s in by) by[s].sort((a, b) => b - a);
    const trumps = by[T];
    const crowd = n >= 5 ? 0.85 : 1; // more players, more chances to be trumped
    let e = 0;
    trumps.forEach((rk, i) => {
      let v = rk === 14 ? 0.95 : rk === 13 ? 0.8 : rk === 12 ? 0.6 : rk === 11 ? 0.45 : rk === 10 ? 0.35 : 0.25;
      if (i >= 2) v = Math.max(v, 0.55); // long trump suit wins late tricks
      e += v;
    });
    let spareTrumps = Math.max(0, trumps.length - 1);
    for (const s of Engine.SUITS) {
      if (s === T) continue;
      const cs = by[s], L = cs.length;
      if (L === 0) {
        if (spareTrumps > 0 && r.cards > 1) { e += 0.3; spareTrumps--; }
        continue;
      }
      const hasA = cs.includes(14), hasK = cs.includes(13);
      if (hasA) e += (L <= 3 ? 0.85 : 0.6) * crowd;
      if (hasK) e += (hasA ? 0.55 : L >= 2 ? 0.3 : 0.1) * crowd;
      if (cs.includes(12) && hasA && hasK) e += 0.15 * crowd;
    }
    return e;
  }
  function bid(r, p) {
    const e = estimate(r, p);
    let b = Math.max(0, Math.min(r.cards, Math.round(e)));
    const f = Engine.forbiddenBid(r, p);
    if (b === f) {
      const up = b + 1, down = b - 1;
      const preferUp = e > b;
      if (preferUp && up <= r.cards) b = up;
      else if (down >= 0) b = down;
      else b = up;
    }
    return b;
  }
  function play(r, p) {
    const legal = Engine.legalInfo(r, p).cards;
    if (legal.length === 1) return legal[0];
    const n = r.hands.length, T = r.trump;
    const isT = (c) => suit(c) === T;
    const nonT = (arr) => arr.filter((c) => !isT(c));
    const preferNonT = (arr) => (nonT(arr).length ? nonT(arr) : arr);
    const need = r.bids[p] - r.tricks[p];

    if (!r.trick.length) {
      if (need > 0) {
        const aces = nonT(legal).filter((c) => rank(c) === 14);
        if (aces.length) return aces[0];
        const tr = legal.filter(isT);
        if (tr.length && rank(high(tr)) >= 13) return high(tr);
      }
      // lead low, from the longest side suit
      const side = nonT(legal);
      if (!side.length) return low(legal);
      const count = {}; side.forEach((c) => { count[suit(c)] = (count[suit(c)] || 0) + 1; });
      const longest = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      return low(side.filter((c) => suit(c) === longest));
    }
    const last = r.trick.length === n - 1;
    const wins = (c) => Engine.trickWinner([...r.trick, { p, c }], T) === p;
    const win = legal.filter(wins), lose = legal.filter((c) => !wins(c));
    if (need > 0) {
      if (win.length) {
        if (last) return low(preferNonT(win));
        const nt = nonT(win);
        return nt.length ? high(nt) : low(win);
      }
      return low(preferNonT(lose));
    }
    if (lose.length) return high(preferNonT(lose)); // shed a dangerous card safely
    return last ? high(win) : low(win);
  }
  return { estimate, bid, play };
})();

