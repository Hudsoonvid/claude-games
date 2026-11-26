// All sound is synthesised: a pouring hiss, sizzles, soft blips and a sparse generative chime.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.lastSizzle = 0; this.nextNote = 0; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // continuous pour bed
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.pourFilter = ctx.createBiquadFilter(); this.pourFilter.type = 'bandpass'; this.pourFilter.frequency.value = 1200; this.pourFilter.Q.value = 0.7;
    this.pourGain = ctx.createGain(); this.pourGain.gain.value = 0;
    src.connect(this.pourFilter).connect(this.pourGain).connect(this.master); src.start();
    // echo for the chimes
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay); this.delay.connect(this.master);
    this.nextNote = ctx.currentTime + 2;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05); }

  pour(level, freq = 1200) {
    if (!this.ctx) return;
    this.pourGain.gain.setTargetAtTime(level * 0.16, this.ctx.currentTime, 0.08);
    this.pourFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
  }

  sizzle() {
    const ctx = this.ctx; if (!ctx || ctx.currentTime - this.lastSizzle < 0.09) return;
    this.lastSizzle = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500 + Math.random() * 2500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.13, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    s.connect(f).connect(g).connect(this.master); s.start(ctx.currentTime, Math.random()); s.stop(ctx.currentTime + 0.32);
  }

  blip(freq = 660, dur = 0.18, type = 'sine', vol = 0.14) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 1.4, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(this.master); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  // running water: a second noise bed whose level follows how much water is flowing
  babble(level) {
    const ctx = this.ctx; if (!ctx) return;
    if (!this.babGain) {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.7;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = ctx.createGain(); lg.gain.value = 500; lfo.connect(lg).connect(f.frequency); lfo.start();
      this.babGain = ctx.createGain(); this.babGain.gain.value = 0;
      src.connect(f).connect(this.babGain).connect(this.master); src.start();
    }
    this.babGain.gain.setTargetAtTime(Math.min(0.11, level), ctx.currentTime, 0.4);
  }

  // ---- the soundscape: wind, water, rain, fire and birds, mixed from what is near the camera
  bed(name, type, freq, q, rate = 1) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master); src.start(0, Math.random() * 1.5);
    return (this.beds ||= {})[name] = { f, g };
  }
  scape(m) {   // m: { wind, waves, rain, fire, birds } each 0..1
    const ctx = this.ctx; if (!ctx) return;
    if (!this.beds) {
      this.bed('wind', 'lowpass', 500, 0.6, 0.5); this.bed('waves', 'bandpass', 600, 0.4, 0.6); this.bed('rain', 'highpass', 2200, 0.3, 1);
      this.windT = 0; this.nextCrackle = 0; this.nextBird = ctx.currentTime + 2;
    }
    const t = ctx.currentTime, B = this.beds;
    this.windT += 0.5;
    const gust = 0.6 + 0.4 * Math.sin(this.windT * 0.21) * Math.sin(this.windT * 0.13 + 1);
    B.wind.g.gain.setTargetAtTime(0.09 * m.wind * gust, t, 1.2); B.wind.f.frequency.setTargetAtTime(300 + 500 * gust * m.wind, t, 1.5);
    const swell = 0.55 + 0.45 * Math.sin(this.windT * 0.9);       // waves come in and go out
    B.waves.g.gain.setTargetAtTime(0.07 * m.waves * swell, t, 0.6);
    B.rain.g.gain.setTargetAtTime(0.06 * m.rain, t, 1.5);
    if (m.fire > 0.05 && t > this.nextCrackle) { // pops and crackles
      this.nextCrackle = t + 0.05 + Math.random() * 0.35 / m.fire;
      const s = ctx.createBufferSource(); s.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 2500; f.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.09 * m.fire, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
      s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.05);
    }
    if (m.birds > 0.05 && t > this.nextBird) { // a little phrase of birdsong
      this.nextBird = t + 1.5 + Math.random() * 6 / m.birds;
      const base = 2200 + Math.random() * 1600, notes = 2 + ((Math.random() * 5) | 0);
      for (let k = 0; k < notes; k++) {
        const o = ctx.createOscillator(); o.type = 'sine'; const s0 = t + k * (0.08 + Math.random() * 0.06);
        o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), s0); o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.7), s0 + 0.07);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, s0); g.gain.linearRampToValueAtTime(0.025 * m.birds, s0 + 0.01); g.gain.linearRampToValueAtTime(0, s0 + 0.08);
        o.connect(g).connect(this.master); o.start(s0); o.stop(s0 + 0.1);
      }
    }
  }

  // a low rumble: thunder, impacts, quakes
  boom(vol = 0.5, dur = 1.4, freq = 180) {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 3, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(freq * 0.4, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    s.connect(f).connect(g).connect(this.master); s.start(ctx.currentTime, Math.random()); s.stop(ctx.currentTime + dur + 0.05);
  }

  // called every frame; schedules an occasional chime. night = 0..1
  ambient(night) {
    const ctx = this.ctx; if (!ctx || ctx.currentTime < this.nextNote) return;
    this.nextNote = ctx.currentTime + 2.2 + Math.random() * 4.5;
    if (night > 0.6) { // crickets
      const t0 = ctx.currentTime + Math.random() * 1.5, f0 = 4200 + Math.random() * 900;
      for (let k = 0; k < 3 + ((Math.random() * 4) | 0); k++) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0; const g = ctx.createGain(), s = t0 + k * 0.075;
        g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.012, s + 0.01); g.gain.linearRampToValueAtTime(0, s + 0.045);
        o.connect(g).connect(this.master); o.start(s); o.stop(s + 0.06);
      }
    }
    const scale = [0, 2, 4, 7, 9, 12, 14, 16], base = night > 0.5 ? 196 : 261.6;
    const f = base * 2 ** (scale[(Math.random() * scale.length) | 0] / 12);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 2.8);
    o.connect(g); g.connect(this.master); g.connect(this.delay); o.start(t); o.stop(t + 3);
  }
}
