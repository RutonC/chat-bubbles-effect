// Sons de teclado sintetizados com a Web Audio API (ruído + envelopes + filtros).
// A saída vai para as colunas e, em paralelo, para um MediaStreamDestination que
// o MediaRecorder grava junto com o vídeo.

export const PRESETS = ['clicky', 'thocky', 'membrane', 'typewriter', 'phone', 'none'];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.streamDest = null;
    this.noise = null;
    this.customBuffer = null;
    this.cfg = { preset: 'thocky', volume: 0.7, pitchVar: 0.35, spaceEnterDiff: true, sentSound: true, ding: true };
  }

  configure(sound) {
    this.cfg = { ...this.cfg, ...sound };
    if (this.master) this.master.gain.value = this.cfg.volume;
  }

  /** Tem de ser chamado a partir de um gesto do utilizador (clique/tecla). */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.cfg.volume;
      this.master.connect(ctx.destination);
      if (ctx.createMediaStreamDestination) {
        this.streamDest = ctx.createMediaStreamDestination();
        this.master.connect(this.streamDest);
      }
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  get hasCustom() {
    return !!this.customBuffer;
  }

  async loadCustomFile(file) {
    if (!this.ensure()) throw new Error('no-audio');
    const buf = await file.arrayBuffer();
    this.customBuffer = await this.ctx.decodeAudioData(buf);
  }

  clearCustom() {
    this.customBuffer = null;
  }

  /**
   * kind: key | space | enter | sent | ding
   * preset: força um preset (usado no botão "testar")
   */
  play(kind, preset = this.cfg.preset, when = 0) {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005 + when;

    if (kind === 'sent') {
      if (this.cfg.sentSound) this.sent(t);
      return;
    }
    if (kind === 'ding') {
      if (this.cfg.ding && preset === 'typewriter') this.ding(t);
      return;
    }
    if (preset === 'none') return;

    const v = this.cfg.pitchVar;
    let pitch = 2 ** ((Math.random() * 2 - 1) * v * 0.25);
    let gain = 1 - Math.random() * 0.3 * v;
    if (this.cfg.spaceEnterDiff) {
      if (kind === 'space') {
        pitch *= 0.78;
        gain *= 1.1;
      } else if (kind === 'enter') {
        pitch *= 0.62;
        gain *= 1.2;
      }
    }

    if (preset === 'custom') {
      this.sample(t, pitch, gain);
      return;
    }
    const voice = VOICES[preset];
    if (voice) voice(this, t, pitch, gain, kind);
  }

  /** Demonstração curta de um preset. */
  test(preset) {
    if (!this.ensure()) return;
    const seq = ['key', 'key', 'key', 'space', 'key', 'key', 'key', 'enter'];
    seq.forEach((k, i) => this.play(k, preset, i * 0.11 + (i > 3 ? 0.05 : 0)));
    if (preset !== 'none') {
      this.play('ding', preset, seq.length * 0.11 + 0.1);
    }
  }

  // ---------- blocos de construção ----------

  burst(t, { type = 'bandpass', freq = 2000, q = 1, dur = 0.03, gain = 0.5, freqEnd = null }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  tone(t, { type = 'sine', freq = 440, freqEnd = null, dur = 0.05, gain = 0.3, attack = 0.002 }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  sample(t, pitch, gain) {
    const ctx = this.ctx;
    if (!this.customBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.customBuffer;
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(t);
  }

  sent(t) {
    this.tone(t, { freq: 1046.5, dur: 0.09, gain: 0.16 });
    this.tone(t + 0.07, { freq: 1568, dur: 0.16, gain: 0.14 });
    this.burst(t, { type: 'bandpass', freq: 1500, freqEnd: 5000, q: 0.8, dur: 0.14, gain: 0.05 });
  }

  ding(t) {
    this.tone(t, { freq: 2637, dur: 1.3, gain: 0.22, attack: 0.001 });
    this.tone(t, { freq: 5274, dur: 0.7, gain: 0.05, attack: 0.001 });
    this.tone(t, { freq: 3951, dur: 0.5, gain: 0.03, attack: 0.001 });
  }
}

// kind só altera ligeiramente as vozes (o pitch já vem ajustado)
const VOICES = {
  clicky(a, t, p, g) {
    a.burst(t, { freq: 3800 * p, q: 0.8, dur: 0.02, gain: 0.7 * g });
    a.tone(t, { type: 'triangle', freq: 2600 * p, freqEnd: 1500 * p, dur: 0.03, gain: 0.2 * g });
    a.burst(t + 0.012, { freq: 1200 * p, q: 1, dur: 0.05, gain: 0.3 * g });
    a.tone(t + 0.012, { freq: 170 * p, freqEnd: 90 * p, dur: 0.06, gain: 0.35 * g });
  },
  thocky(a, t, p, g) {
    a.burst(t, { type: 'lowpass', freq: 900 * p, q: 0.7, dur: 0.07, gain: 0.8 * g });
    a.burst(t, { freq: 260 * p, q: 1.5, dur: 0.1, gain: 0.7 * g });
    a.tone(t, { freq: 125 * p, freqEnd: 68 * p, dur: 0.13, gain: 0.7 * g });
    a.burst(t, { freq: 2200 * p, q: 1, dur: 0.01, gain: 0.1 * g });
  },
  membrane(a, t, p, g) {
    a.burst(t, { freq: 1500 * p, q: 0.6, dur: 0.03, gain: 0.45 * g });
    a.tone(t, { freq: 420 * p, freqEnd: 260 * p, dur: 0.045, gain: 0.25 * g });
    a.burst(t + 0.008, { type: 'lowpass', freq: 600 * p, q: 0.7, dur: 0.05, gain: 0.3 * g });
  },
  typewriter(a, t, p, g, kind) {
    if (kind === 'enter') {
      // alavanca do carro: "zip" metálico + pancada
      a.burst(t, { freq: 600, freqEnd: 2600, q: 1.2, dur: 0.26, gain: 0.35 * g });
      a.burst(t + 0.26, { freq: 1600, q: 1, dur: 0.04, gain: 0.5 * g });
      a.tone(t + 0.26, { freq: 110, freqEnd: 70, dur: 0.12, gain: 0.5 * g });
      return;
    }
    a.tone(t, { type: 'square', freq: 1100 * p, freqEnd: 700 * p, dur: 0.012, gain: 0.1 * g });
    a.burst(t, { freq: 2200 * p, q: 1, dur: 0.03, gain: 0.7 * g });
    a.burst(t, { type: 'lowpass', freq: 500 * p, q: 0.8, dur: 0.08, gain: 0.6 * g });
    a.burst(t + 0.035, { freq: 1400 * p, q: 1, dur: 0.02, gain: 0.3 * g });
  },
  phone(a, t, p, g) {
    a.tone(t, { freq: 1400 * p, freqEnd: 900 * p, dur: 0.035, gain: 0.35 * g });
    a.burst(t, { freq: 2500 * p, q: 1, dur: 0.01, gain: 0.1 * g });
  },
};
