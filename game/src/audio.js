// WebAudio synth engine: every sound and the music loop are synthesized, no assets.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.musicGain = null; this.sfxGain = null;
    this.muted = false; this.musicTimer = null; this.musicStep = 0;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenHigh = false;
    this.skidSrc = null; this.skidGain = null;
    this.noiseBuf = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16; this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startEngineLoop(); this.startSiren(); this.startSkid();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }
  // ---- music: a laid-back 100 BPM A-minor groove, 16 steps a bar, 4 bars ----
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bpm = 100, stepDur = 60 / bpm / 4;
    const bass = [45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 50, 0, 48, 0,
                  45, 0, 45, 0, 48, 0, 45, 0, 52, 0, 50, 0, 48, 0, 47, 0,
                  45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 50, 0, 48, 0,
                  45, 0, 45, 0, 48, 0, 52, 0, 55, 0, 52, 0, 50, 0, 48, 0];
    const chord = [[57, 60, 64], [57, 60, 64], [55, 59, 62], [55, 59, 62]];
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const s = this.musicStep, bar = Math.floor(s / 16) % 4, t = this.ctx.currentTime + 0.05;
      const b = bass[s % 64];
      if (b) this.pluck(midi(b - 12), t, stepDur * 1.8, 'triangle', 0.5, this.musicGain);
      if (s % 16 === 0) for (const n of chord[bar]) this.pluck(midi(n), t, stepDur * 14, 'sine', 0.10, this.musicGain);
      if (s % 4 === 2) this.hat(t, 0.05);
      if (s % 8 === 4) this.pluck(midi(76), t, stepDur, 'sine', 0.06, this.musicGain);
      this.musicStep++;
    }, stepDur * 1000);
  }
  pluck(freq, t, dur, type, vol, dest) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.musicGain); o.start(t); o.stop(t + dur + 0.05);
  }
  hat(t, dur) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.musicGain); s.start(t); s.stop(t + dur);
  }
  // ---- continuous loops: engine, siren, skid ----
  startEngineLoop() {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 50;
    f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 2;
    g.gain.value = 0; o.connect(f); f.connect(g); g.connect(this.master); o.start();
    this.engineOsc = o; this.engineGain = g; this.engineFilter = f;
  }
  setEngine(speed01, on) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(45 + speed01 * 130, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1);
  }
  startSiren() {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 720; g.gain.value = 0;
    o.connect(g); g.connect(this.master); o.start();
    this.sirenOsc = o; this.sirenGain = g;
    setInterval(() => {
      if (!this.ctx || !this.sirenOsc) return;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 720, this.ctx.currentTime, 0.05);
    }, 450);
  }
  setSiren(dist) {
    if (!this.sirenGain) return;
    const vol = dist == null ? 0 : Math.max(0, 0.10 - dist * 0.0012);
    this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : vol, this.ctx.currentTime, 0.2);
  }
  startSkid() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.skidSrc = s; this.skidGain = g;
  }
  setSkid(on) {
    if (!this.skidGain) return;
    this.skidGain.gain.setTargetAtTime(on ? 0.07 : 0, this.ctx.currentTime, 0.08);
  }
  // ---- one-shots ----
  burst(dur, freq, type, vol) {
    if (!this.ctx || this.muted) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 1200;
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol || 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t); s.stop(t + dur);
  }
  shoot() { this.burst(0.14, 1800, 'lowpass', 0.55); this.burst(0.06, 5000, 'highpass', 0.2); }
  enemyShoot() { this.burst(0.12, 1400, 'lowpass', 0.25); }
  explosion() { this.burst(0.9, 300, 'lowpass', 0.9); this.burst(0.4, 900, 'lowpass', 0.4); }
  reload() { this.pluck(520, this.ctx.currentTime, 0.08, 'square', 0.12, this.sfxGain); }
  pickup() { const t = this.ctx.currentTime; this.pluck(660, t, 0.12, 'sine', 0.25, this.sfxGain); this.pluck(880, t + 0.09, 0.18, 'sine', 0.25, this.sfxGain); }
  missionComplete() { const t = this.ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => this.pluck(f, t + i * 0.11, 0.3, 'triangle', 0.3, this.sfxGain)); }
  wantedUp() { const t = this.ctx.currentTime; this.pluck(220, t, 0.2, 'sawtooth', 0.2, this.sfxGain); this.pluck(233, t + 0.16, 0.25, 'sawtooth', 0.2, this.sfxGain); }
  busted() { const t = this.ctx.currentTime; [392, 370, 349, 330].forEach((f, i) => this.pluck(f, t + i * 0.18, 0.3, 'sawtooth', 0.18, this.sfxGain)); }
  uiClick() { if (this.ctx) this.pluck(700, this.ctx.currentTime, 0.06, 'square', 0.1, this.sfxGain); }
  thud() { this.burst(0.1, 220, 'lowpass', 0.4); }
}
