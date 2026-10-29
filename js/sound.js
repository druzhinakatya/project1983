/* ============ SOUND (synthesised with Web Audio; off until the player turns it on) ============ */
const SOUND_KEY = 'sitaratas.sound';
const Sfx = (() => {
  let ctx = null, on = store.get(SOUND_KEY) === '1';
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noise(c, dur) {
    const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; return s;
  }
  function gainEnv(c, t, attack, peak, decay) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  function tone(c, t, freq, type, peak, dur) {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = gainEnv(c, t, 0.01, peak, dur); o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(c, t, dur, type, freq, q, peak) {
    const n = noise(c, dur), f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    const g = gainEnv(c, t, 0.003, peak, dur); n.connect(f).connect(g).connect(c.destination); n.start(t); n.stop(t + dur + 0.02);
    return f;
  }
  const sounds = {
    card(c, t) { burst(c, t, 0.07, 'bandpass', 2300, 0.9, 0.35); tone(c, t, 180, 'sine', 0.08, 0.05); },        // card snap
    deal(c, t, step, count) { for (let k = 0; k < Math.min(count, 40); k++) burst(c, t + (k * step) / 1000, 0.03, 'highpass', 3200, 0.7, 0.09); },
    win(c, t) { const f = burst(c, t, 0.32, 'bandpass', 700, 1.2, 0.14); f.frequency.exponentialRampToValueAtTime(2600, t + 0.3); }, // swoosh
    ping(c, t) { tone(c, t, 880, 'sine', 0.09, 0.18); tone(c, t + 0.09, 1320, 'sine', 0.07, 0.22); },          // your turn
    chime(c, t) { [659, 831, 988, 1319].forEach((f, i) => tone(c, t + i * 0.08, f, 'triangle', 0.12, 0.45)); }, // exact bid / achievement
    boom(c, t) {                                                                                                 // explosion
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.55);
      const g = gainEnv(c, t, 0.005, 0.6, 0.6); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.7);
      const f = burst(c, t, 0.8, 'lowpass', 3000, 0.5, 0.45); f.frequency.exponentialRampToValueAtTime(200, t + 0.8);
    },
    crackle(c, t) { for (let k = 0; k < 14; k++) burst(c, t + Math.random() * 0.9, 0.02, 'highpass', 1500 + Math.random() * 3000, 0.6, 0.12 + Math.random() * 0.1); } // on fire
  };
  function fx(name, ...args) { if (!on) return; const c = ac(); if (!c) return; try { sounds[name](c, c.currentTime + 0.01, ...args); } catch (e) {} }
  function toggle() { on = !on; store.set(SOUND_KEY, on ? '1' : '0'); if (on) fx('ping'); }
  return { fx, toggle, get on() { return on; } };
})();
/* Watch the game state between screen updates and play a sound for each new event (same for host, friends and hotseat). */
function soundEvents() {
  const r = game && !game.over && game.round;
  if (!r || ui.screen !== 'game') { ui.snd = null; return; }
  const s = { key: (game.id || '') + ':' + game.roundIdx, trick: r.trick.length, phase: r.phase, turn: r.turn,
    streak: game.streak ? game.streak.p + ':' + game.streak.n : '', hist: game.history.length, mine: myTurn() };
  const p = ui.snd; ui.snd = s;
  if (!p || !Sfx.on) return;
  if (s.key !== p.key && ui.deal && dealActive()) Sfx.fx('deal', ui.deal.step, ui.deal.total);
  if (s.key === p.key && s.trick > p.trick) Sfx.fx('card');
  if (s.phase === 'trickDone' && p.phase !== 'trickDone') Sfx.fx('win');
  if (s.hist > p.hist) {
    const h = game.history[s.hist - 1], mine = trackedSeats();
    if (h.bids.some((b, i) => b > 3 && b === h.tricks[i])) Sfx.fx('boom');
    else if (mine.some((i) => h.bids[i] === h.tricks[i])) Sfx.fx('chime');
  }
  if (game.streak && game.streak.n === 3 && s.streak !== p.streak) Sfx.fx('crackle');
  if (s.mine && !p.mine) Sfx.fx('ping');
}

