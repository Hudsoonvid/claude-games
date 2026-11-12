// Fully synthesized audio: no sample files. WebAudio SFX plus a generative ambient score.
let ctx = null;
let master, sfxBus, musicBus, reverb, reverbIn, noiseBuf;
let muted = false;
let biome = null;
let bossMode = false;
let nextChordT = 0;
let nextBeatT = 0;
let chordIdx = 0;
let beat = 0;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const SCORES = {
  kiln: { root: 38, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], chordLen: 9, pluck: 0.32, bright: 700, oct: 2 },
  root: { root: 41, scale: [0, 2, 4, 6, 7, 9, 11], chords: [[0, 2, 4], [1, 3, 5], [4, 6, 1], [3, 5, 0]], chordLen: 8, pluck: 0.5, bright: 1000, oct: 2 },
  forge: { root: 36, scale: [0, 1, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 1, 3]], chordLen: 8, pluck: 0.35, bright: 620, oct: 2 },
  rime: { root: 40, scale: [0, 2, 4, 6, 7, 9, 11], chords: [[0, 2, 4], [4, 6, 1], [3, 5, 0], [1, 3, 5]], chordLen: 9, pluck: 0.6, bright: 1500, oct: 3 },
  vault: { root: 37, scale: [0, 2, 3, 5, 7, 8, 11], chords: [[0, 2, 4], [3, 5, 0], [5, 0, 2], [4, 6, 1]], chordLen: 8, pluck: 0.55, bright: 1300, oct: 3 },
};

function makeReverb() {
  const len = ctx.sampleRate * 3.2;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (t < 0.01 ? t * 100 : 1);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function env(g, t, attack, hold, release, peak) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.2, vol = 0.2, attack = 0.005, delay = 0, bus = sfxBus, wet = 0, detune = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, attack, 0, Math.max(0.02, dur - attack), vol);
  o.connect(g).connect(bus);
  if (wet > 0) {
    const w = ctx.createGain();
    w.gain.value = wet;
    g.connect(w).connect(reverbIn);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.2, f0 = 1000, f1 = f0, q = 1, type = 'bandpass', attack = 0.003, delay = 0, bus = sfxBus, wet = 0 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.loopStart = Math.random() * 0.5;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, attack, 0, Math.max(0.02, dur - attack), vol);
  s.connect(f).connect(g).connect(bus);
  if (wet > 0) {
    const w = ctx.createGain();
    w.gain.value = wet;
    g.connect(w).connect(reverbIn);
  }
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}

const SFX = {
  slash: () => {
    noise({ dur: 0.13, vol: 0.22, f0: 3200, f1: 800, q: 1.4 });
    tone({ type: 'triangle', f0: 900, f1: 420, dur: 0.09, vol: 0.05 });
  },
  hit: () => {
    noise({ dur: 0.1, vol: 0.4, f0: 1800, f1: 300, q: 0.8, type: 'lowpass' });
    tone({ type: 'square', f0: 210, f1: 70, dur: 0.1, vol: 0.16 });
    tone({ type: 'sine', f0: 1500, f1: 900, dur: 0.07, vol: 0.07 });
  },
  clink: () => {
    tone({ type: 'triangle', f0: 2400, f1: 1800, dur: 0.08, vol: 0.09, wet: 0.3 });
    noise({ dur: 0.04, vol: 0.12, f0: 5000, q: 2 });
  },
  kill: () => {
    tone({ type: 'sine', f0: 150, f1: 38, dur: 0.35, vol: 0.45 });
    noise({ dur: 0.3, vol: 0.3, f0: 2500, f1: 200, type: 'lowpass' });
    tone({ type: 'sine', f0: 880, f1: 1320, dur: 0.4, vol: 0.06, delay: 0.05, wet: 0.6 });
  },
  hurt: () => {
    tone({ type: 'sawtooth', f0: 320, f1: 70, dur: 0.35, vol: 0.22 });
    noise({ dur: 0.25, vol: 0.3, f0: 900, f1: 150, type: 'lowpass' });
  },
  jump: () => tone({ type: 'sine', f0: 280, f1: 480, dur: 0.1, vol: 0.07 }),
  djump: () => {
    tone({ type: 'sine', f0: 420, f1: 880, dur: 0.14, vol: 0.09, wet: 0.3 });
    noise({ dur: 0.12, vol: 0.1, f0: 1500, f1: 4000, q: 1 });
  },
  walljump: () => {
    tone({ type: 'sine', f0: 340, f1: 620, dur: 0.1, vol: 0.08 });
    noise({ dur: 0.06, vol: 0.1, f0: 1200, type: 'lowpass' });
  },
  land: () => noise({ dur: 0.08, vol: 0.16, f0: 500, f1: 150, type: 'lowpass' }),
  step: () => noise({ dur: 0.04, vol: 0.05, f0: 700 + Math.random() * 400, type: 'lowpass' }),
  dash: () => {
    noise({ dur: 0.22, vol: 0.26, f0: 500, f1: 3800, q: 0.9 });
    tone({ type: 'sine', f0: 240, f1: 110, dur: 0.18, vol: 0.1 });
  },
  glint: (n = 0) => tone({ type: 'sine', f0: 1250 * Math.pow(1.06, n % 12), dur: 0.12, vol: 0.07, wet: 0.4 }),
  pot: () => {
    noise({ dur: 0.18, vol: 0.3, f0: 2600, f1: 900, type: 'highpass' });
    tone({ type: 'triangle', f0: 520, f1: 240, dur: 0.12, vol: 0.12 });
  },
  focus: () => tone({ type: 'sine', f0: 180, f1: 420, dur: 0.9, vol: 0.07, attack: 0.3, wet: 0.5 }),
  heal: () => {
    [0, 4, 7, 12].forEach((s, i) => tone({ type: 'sine', f0: mtof(74 + s), dur: 0.7, vol: 0.09, delay: i * 0.06, wet: 0.7 }));
    noise({ dur: 0.5, vol: 0.06, f0: 5000, f1: 9000, q: 2 });
  },
  flare: () => {
    tone({ type: 'sawtooth', f0: 160, f1: 620, dur: 0.22, vol: 0.14 });
    noise({ dur: 0.4, vol: 0.25, f0: 700, f1: 3000, q: 0.7, wet: 0.3 });
  },
  flareHit: () => {
    noise({ dur: 0.35, vol: 0.35, f0: 2400, f1: 250, type: 'lowpass', wet: 0.3 });
    tone({ type: 'sine', f0: 200, f1: 50, dur: 0.3, vol: 0.3 });
  },
  pickup: () => {
    [0, 7, 12, 16, 19, 24].forEach((s, i) => tone({ type: 'triangle', f0: mtof(62 + s), dur: 2.2, vol: 0.09, delay: i * 0.13, wet: 0.9 }));
    tone({ type: 'sine', f0: mtof(38), dur: 3, vol: 0.2, attack: 0.4, wet: 0.5 });
  },
  rest: () => {
    [0, 7, 15, 19].forEach((s, i) => tone({ type: 'sine', f0: mtof(57 + s), dur: 2.4, vol: 0.08, delay: i * 0.18, attack: 0.2, wet: 0.9 }));
    noise({ dur: 1.2, vol: 0.08, f0: 400, f1: 1800, type: 'lowpass', attack: 0.3 });
  },
  spit: () => {
    tone({ type: 'square', f0: 520, f1: 180, dur: 0.14, vol: 0.09 });
    noise({ dur: 0.08, vol: 0.12, f0: 1500, q: 2 });
  },
  windup: () => tone({ type: 'sawtooth', f0: 70, f1: 160, dur: 0.5, vol: 0.12, attack: 0.2 }),
  roar: () => {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 1.3);
    l.frequency.value = 27;
    lg.gain.value = 22;
    l.connect(lg).connect(o.frequency);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 1.3);
    env(g, t, 0.08, 0.5, 0.8, 0.4);
    o.connect(f).connect(g);
    g.connect(sfxBus);
    const w = ctx.createGain();
    w.gain.value = 0.6;
    g.connect(w).connect(reverbIn);
    o.start(t);
    l.start(t);
    o.stop(t + 1.5);
    l.stop(t + 1.5);
    noise({ dur: 1.2, vol: 0.2, f0: 300, f1: 900, type: 'bandpass', q: 0.6, attack: 0.1, wet: 0.5 });
  },
  slam: () => {
    tone({ type: 'sine', f0: 110, f1: 28, dur: 0.6, vol: 0.6 });
    noise({ dur: 0.5, vol: 0.45, f0: 1800, f1: 120, type: 'lowpass', wet: 0.4 });
  },
  gate: () => {
    tone({ type: 'sawtooth', f0: 60, f1: 44, dur: 0.9, vol: 0.2, attack: 0.1 });
    noise({ dur: 0.9, vol: 0.2, f0: 300, f1: 120, type: 'lowpass', attack: 0.1 });
    tone({ type: 'square', f0: 90, f1: 50, dur: 0.15, vol: 0.2, delay: 0.85 });
  },
  ui: () => tone({ type: 'sine', f0: 700, f1: 900, dur: 0.06, vol: 0.06 }),
  uiOk: () => {
    tone({ type: 'sine', f0: 620, dur: 0.12, vol: 0.08, wet: 0.5 });
    tone({ type: 'sine', f0: 930, dur: 0.2, vol: 0.08, delay: 0.08, wet: 0.5 });
  },
  death: () => {
    [0, -3, -7, -12].forEach((s, i) => tone({ type: 'triangle', f0: mtof(62 + s), dur: 0.9, vol: 0.13, delay: i * 0.22, wet: 0.8 }));
    noise({ dur: 1.4, vol: 0.25, f0: 2000, f1: 100, type: 'lowpass', wet: 0.5 });
  },
  tablet: () => tone({ type: 'sine', f0: 392, f1: 523, dur: 0.5, vol: 0.07, attack: 0.1, wet: 0.8 }),
  ember: () => {
    [0, 5, 9, 12, 17].forEach((s, i) => tone({ type: 'sine', f0: mtof(69 + s), dur: 1.6, vol: 0.09, delay: i * 0.1, wet: 0.9 }));
  },
};

function pad(freq, t, dur, vol, bright) {
  for (const det of [-7, 6]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = det;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(bright * 0.4, t);
    f.frequency.linearRampToValueAtTime(bright, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(bright * 0.4, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
    o.connect(f).connect(g);
    g.connect(musicBus);
    g.connect(reverbIn);
    o.start(t);
    o.stop(t + dur + 1.6);
  }
}

function pluck(freq, t, vol, type = 'sine') {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o2.type = 'sine';
  o.frequency.value = freq;
  o2.frequency.value = freq * 2.003;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  const g2 = ctx.createGain();
  g2.gain.value = 0.25;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(musicBus);
  const w = ctx.createGain();
  w.gain.value = 1.2;
  g.connect(w).connect(reverbIn);
  o.start(t);
  o2.start(t);
  o.stop(t + 2.7);
  o2.stop(t + 2.7);
}

function drum(t, kind) {
  if (kind === 'kick') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.22);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 0.35);
  } else {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'tom' ? 300 : 2400;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(kind === 'tom' ? 0.3 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'tom' ? 0.25 : 0.08));
    s.connect(f).connect(g).connect(musicBus);
    g.connect(reverbIn);
    s.start(t, Math.random());
    s.stop(t + 0.3);
  }
}

function scheduleMusic() {
  if (!ctx || !biome) return;
  const sc = SCORES[biome];
  const now = ctx.currentTime;
  const noteOf = (deg, oct) => sc.root + 12 * oct + sc.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);

  if (bossMode) {
    const step = 60 / 132 / 2;
    while (nextBeatT < now + 0.3) {
      const t = Math.max(nextBeatT, now + 0.02);
      const b = beat % 16;
      if (b % 4 === 0) drum(t, 'kick');
      if (b === 6 || b === 14 || b === 15) drum(t, 'tom');
      if (b % 2 === 1) drum(t, 'hat');
      // driving bass ostinato
      const pat = [0, 0, 7, 0, 0, 5, 0, 3, 0, 0, 7, 0, 8, 7, 5, 3];
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = mtof(sc.root + pat[b] - (b % 2 ? 0 : 0));
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(180, t + step * 0.9);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
      o.connect(f).connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + step);
      if (b === 0) {
        const ch = sc.chords[chordIdx++ % sc.chords.length];
        ch.forEach((d) => pad(mtof(noteOf(d, 2)), t, step * 16, 0.035, 1500));
      }
      if (b % 4 === 2 && Math.random() < 0.7) pluck(mtof(noteOf(Math.floor(Math.random() * 7), 3)), t, 0.07, 'triangle');
      beat++;
      nextBeatT += step;
    }
    return;
  }

  while (nextChordT < now + 0.5) {
    const t = Math.max(nextChordT, now + 0.05);
    const ch = sc.chords[chordIdx++ % sc.chords.length];
    pad(mtof(noteOf(ch[0], 0)), t, sc.chordLen, 0.05, sc.bright * 0.6);
    ch.forEach((d, i) => pad(mtof(noteOf(d, 1 + (i === 2 ? 1 : 0))), t, sc.chordLen, 0.028, sc.bright));
    // sparse melodic fragments drawn from the chord + neighbours
    const n = 2 + Math.floor(Math.random() * 4);
    let tt = t + 0.5 + Math.random();
    let deg = ch[Math.floor(Math.random() * 3)];
    for (let i = 0; i < n; i++) {
      if (Math.random() < sc.pluck + 0.3) pluck(mtof(noteOf(deg, sc.oct + 1)), tt, 0.055 + Math.random() * 0.03, biome === 'vault' || biome === 'rime' ? 'triangle' : 'sine');
      deg += [-2, -1, 1, 2, 2, -1][Math.floor(Math.random() * 6)];
      tt += [0.5, 0.75, 1, 1.5][Math.floor(Math.random() * 4)];
      if (tt > t + sc.chordLen - 0.5) break;
    }
    nextChordT = t + sc.chordLen;
  }
}

export const audio = {
  init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.55;
    musicBus.connect(master);
    reverb = makeReverb();
    reverbIn = ctx.createGain();
    reverbIn.gain.value = 0.5;
    reverbIn.connect(reverb).connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextChordT = ctx.currentTime + 0.3;
    nextBeatT = ctx.currentTime + 0.3;
  },
  sfx(name, arg) {
    if (!ctx || muted) return;
    try {
      SFX[name] && SFX[name](arg);
    } catch (e) {
      /* audio is best-effort */
    }
  },
  setBiome(b) {
    if (biome === b) return;
    biome = b;
    chordIdx = 0;
    if (ctx) nextChordT = ctx.currentTime + 0.4;
  },
  setBoss(on) {
    if (bossMode === on) return;
    bossMode = on;
    beat = 0;
    if (ctx) {
      nextBeatT = ctx.currentTime + 0.4;
      nextChordT = ctx.currentTime + 2.5;
    }
  },
  toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    return muted;
  },
  get muted() {
    return muted;
  },
  update() {
    if (ctx && ctx.state === 'running') scheduleMusic();
  },
};
