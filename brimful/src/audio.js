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
    const scale = [0, 2, 4, 7, 9, 12, 14, 16], base = night > 0.5 ? 196 : 261.6;
    const f = base * 2 ** (scale[(Math.random() * scale.length) | 0] / 12);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 2.8);
    o.connect(g); g.connect(this.master); g.connect(this.delay); o.start(t); o.stop(t + 3);
  }
}
