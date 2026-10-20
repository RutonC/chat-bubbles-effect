// Sons de teclado sintetizados com a Web Audio API (sem ficheiros).
//
// Um toque de teclado mecânico real tem várias partes, e é isso que se modela:
//   1. transiente do interruptor (clique agudo, no azul);
//   2. "bottom-out": a tecla bate na placa; o corpo ressoa em vários modos
//      amortecidos (fundamental + harmónicos) sobre ruído castanho (grave);
//   3. estabilizador/mola nas teclas largas (espaço, Enter);
//   4. som de SOLTAR a tecla (key-up), mais suave;
//   5. variação por tecla, ligeira posição estéreo e um pouco de "sala".
// A saída vai para as colunas e, em paralelo, para um MediaStreamDestination
// que o MediaRecorder grava junto com o vídeo.

export const PRESETS = ['clicky', 'thocky', 'membrane', 'typewriter', 'phone', 'none'];

const rand = (a, b) => a + Math.random() * (b - a);

function keyPitch(char) {
  if (!char) return 1;
  let h = 7;
  for (const c of char) h = (h * 31 + c.codePointAt(0)) % 97;
  return 1 + (h / 97 - 0.5) * 0.1; // ±5 % estável por tecla
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ctxFactory = null; // permite testes offline
    this.master = null;
    this.bus = null;
    this.send = null;
    this.out = null;
    this.streamDest = null;
    this.white = null;
    this.brown = null;
    this.customBuffer = null;
    this.cfg = { preset: 'thocky', volume: 0.7, pitchVar: 0.35, spaceEnterDiff: true, sentSound: true, ding: true, release: true, room: 0.15, offset: 0 };
  }

  configure(sound) {
    this.cfg = { ...this.cfg, ...sound };
    if (this.master) this.master.gain.value = this.cfg.volume;
    if (this.send) this.send.gain.value = this.cfg.room * 0.5;
  }

  /** Tem de ser chamado a partir de um gesto do utilizador (clique/tecla). */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC && !this.ctxFactory) return false;
      const ctx = this.ctxFactory ? this.ctxFactory() : new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.cfg.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this._buf = new Float32Array(this.analyser.fftSize);
      comp.connect(this.analyser);
      if (ctx.createMediaStreamDestination) {
        this.streamDest = ctx.createMediaStreamDestination();
        comp.connect(this.streamDest);
      }

      this.bus = ctx.createGain();
      this.bus.connect(this.master);
      this.send = ctx.createGain();
      this.send.gain.value = this.cfg.room * 0.5;
      const reverb = ctx.createConvolver();
      reverb.buffer = this._impulse(ctx);
      this.send.connect(reverb);
      reverb.connect(this.master);

      const len = ctx.sampleRate;
      this.white = ctx.createBuffer(1, len, ctx.sampleRate);
      this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
      const w = this.white.getChannelData(0);
      const b = this.brown.getChannelData(0);
      let last = 0;
      let peak = 0;
      for (let i = 0; i < len; i++) {
        w[i] = Math.random() * 2 - 1;
        last = (last + 0.02 * w[i]) / 1.02;
        b[i] = last;
        peak = Math.max(peak, Math.abs(last));
      }
      for (let i = 0; i < len; i++) b[i] /= peak || 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume?.()?.catch?.(() => {});
    return true;
  }

  /** Nível de pico (0..1) do que está a sair neste momento. */
  peak() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this._buf);
    let p = 0;
    for (let i = 0; i < this._buf.length; i++) p = Math.max(p, Math.abs(this._buf[i]));
    return p;
  }

  _impulse(ctx) {
    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }

  get hasCustom() {
    return !!this.customBuffer;
  }

  async loadCustomFile(file) {
    if (!this.ensure()) throw new Error('no-audio');
    this.customBuffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
  }

  clearCustom() {
    this.customBuffer = null;
  }

  /** Liga as vozes de um toque a um painel estéreo aleatório + envio para a "sala". */
  _route(fn) {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = rand(-0.22, 0.22);
    pan.connect(this.bus);
    pan.connect(this.send);
    this.out = pan;
    try {
      fn();
    } finally {
      this.out = null;
    }
  }

  _pitchGain(kind, char) {
    const v = this.cfg.pitchVar;
    let pitch = keyPitch(char) * 2 ** (rand(-1, 1) * v * 0.22);
    let gain = 1 - Math.random() * 0.3 * v;
    if (this.cfg.spaceEnterDiff) {
      if (kind === 'space') {
        pitch *= 0.8;
        gain *= 1.1;
      } else if (kind === 'enter') {
        pitch *= 0.66;
        gain *= 1.2;
      }
    }
    return [pitch, gain];
  }

  /**
   * kind: key | space | enter | sent | ding
   * when: atraso em segundos a partir de agora (agendamento exato)
   * opts.autoRelease=false: o chamador trata do som de soltar (modo ao vivo)
   */
  play(kind, preset = this.cfg.preset, when = 0, char = '', opts = {}) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + 0.003 + Math.max(0, when + this.cfg.offset / 1000);

    if (kind === 'sent') {
      if (this.cfg.sentSound) this._route(() => this.sent(t));
      return;
    }
    if (kind === 'ding') {
      if (this.cfg.ding && preset === 'typewriter') this._route(() => this.ding(t));
      return;
    }
    if (preset === 'none') return;

    const [pitch, gain] = this._pitchGain(kind, char);
    if (preset === 'custom') {
      this.sample(t, pitch, gain);
      return;
    }
    const voice = VOICES[preset];
    if (!voice) return;
    this._route(() => voice.down(this, t, pitch, gain, kind));

    if (this.cfg.release && opts.autoRelease !== false && voice.up) {
      const wide = kind !== 'key';
      const hold = wide ? rand(0.09, 0.16) : rand(0.065, 0.12);
      this._route(() => voice.up(this, t + hold, pitch, gain * 0.9, kind));
    }
  }

  /** Som de soltar a tecla (usado no modo ao vivo, com o keyup real). */
  release(kind, preset = this.cfg.preset, char = '') {
    if (!this.cfg.release || preset === 'none' || preset === 'custom' || !this.ensure()) return;
    const voice = VOICES[preset];
    if (!voice?.up) return;
    const [pitch, gain] = this._pitchGain(kind, char);
    const t = this.ctx.currentTime + 0.003;
    this._route(() => voice.up(this, t, pitch, gain * 0.9, kind));
  }

  /** Demonstração curta de um preset. */
  test(preset) {
    if (!this.ensure()) return;
    const seq = [['key', 't'], ['key', 'e'], ['key', 's'], ['key', 't'], ['space', ' '], ['key', 'o'], ['key', 'k'], ['enter', '']];
    seq.forEach(([k, c], i) => this.play(k, preset, i * 0.13 + (i > 3 ? 0.05 : 0), c));
    this.play('sent', preset, seq.length * 0.13 + 0.05);
    this.play('ding', preset, seq.length * 0.13 + 0.1);
  }

  // ---------- blocos de construção ----------

  /** Sinusoide amortecida: um modo de ressonância. */
  ping(t, freq, decay, gain, freqEnd = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + decay * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(gain, 0.0002), t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + decay + 0.01);
  }

  /** Rajada de ruído filtrado (branco ou castanho = mais grave). */
  noise(t, { kind = 'white', type = 'bandpass', freq = 2000, q = 1, dur = 0.03, gain = 0.5, freqEnd = null }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = kind === 'brown' ? this.brown : this.white;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(gain, 0.0002), t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.01);
  }

  sample(t, pitch, gain) {
    if (!this.customBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.customBuffer;
    src.playbackRate.value = pitch;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(t);
  }

  sent(t) {
    this.ping(t, 1046.5, 0.09, 0.16);
    this.ping(t + 0.07, 1568, 0.18, 0.14);
    this.noise(t, { freq: 1500, freqEnd: 5000, q: 0.8, dur: 0.14, gain: 0.05 });
  }

  ding(t) {
    this.ping(t, 2637, 1.3, 0.22);
    this.ping(t, 5274, 0.7, 0.05);
    this.ping(t, 3951, 0.5, 0.03);
  }
}

/** Mola do estabilizador das teclas largas: dois "tinidos" metálicos curtos. */
function stabilizer(a, t, p, g, long) {
  a.noise(t + 0.003, { freq: 3100 * p, q: 7, dur: 0.03, gain: 0.22 * g });
  a.ping(t + 0.004, 2600 * p, 0.05, 0.05 * g);
  if (long) {
    a.noise(t + 0.015, { freq: 2300 * p, q: 8, dur: 0.035, gain: 0.16 * g });
    a.ping(t + 0.017, 1900 * p, 0.06, 0.045 * g);
  }
}

const VOICES = {
  // Interruptor azul: clique agudo da "jaqueta" e, ~9 ms depois, a tecla bate na placa.
  clicky: {
    down(a, t, p, g, kind) {
      a.noise(t, { freq: 5200 * p, q: 2.5, dur: 0.012, gain: 0.85 * g });
      a.ping(t, 4300 * p, 0.022, 0.28 * g, 3400 * p);
      a.ping(t + 0.0015, 6100 * p, 0.012, 0.12 * g);
      const b = t + 0.009;
      a.noise(b, { kind: 'brown', type: 'lowpass', freq: 1500 * p, dur: 0.05, gain: 0.7 * g });
      a.ping(b, 215 * p, 0.07, 0.5 * g, 170 * p);
      a.ping(b, 430 * p, 0.045, 0.28 * g);
      a.ping(b, 790 * p, 0.03, 0.14 * g);
      a.noise(b, { freq: 2400 * p, q: 1.2, dur: 0.016, gain: 0.3 * g });
      if (kind !== 'key') stabilizer(a, b, p, g, kind === 'enter' || kind === 'space');
    },
    up(a, t, p, g) {
      a.noise(t, { freq: 4200 * p, q: 2, dur: 0.01, gain: 0.35 * g });
      a.ping(t, 3600 * p, 0.014, 0.1 * g);
      a.ping(t, 260 * p, 0.03, 0.12 * g);
    },
  },

  // Linear lubrificado em caixa com espuma: grave, "cremoso", sem clique.
  thocky: {
    down(a, t, p, g, kind) {
      a.noise(t, { type: 'lowpass', freq: 2600, dur: 0.006, gain: 0.25 * g });
      a.noise(t, { kind: 'brown', type: 'lowpass', freq: 800 * p, dur: 0.09, gain: 0.9 * g });
      a.ping(t, 150 * p, 0.14, 0.75 * g, 105 * p);
      a.ping(t, 290 * p, 0.08, 0.38 * g, 230 * p);
      a.ping(t, 430 * p, 0.05, 0.2 * g);
      a.ping(t, 640 * p, 0.03, 0.08 * g);
      if (kind !== 'key') stabilizer(a, t + 0.002, p * 0.9, g * 0.8, true);
    },
    up(a, t, p, g) {
      a.noise(t, { kind: 'brown', type: 'lowpass', freq: 600 * p, dur: 0.03, gain: 0.35 * g });
      a.ping(t, 190 * p, 0.04, 0.2 * g);
    },
  },

  // Membrana / portátil: cúpula de borracha, mais mole e curta.
  membrane: {
    down(a, t, p, g, kind) {
      a.noise(t, { kind: 'brown', type: 'lowpass', freq: 1800 * p, dur: 0.05, gain: 0.75 * g });
      a.noise(t, { freq: 2200 * p, q: 0.8, dur: 0.02, gain: 0.3 * g });
      a.ping(t, 340 * p, 0.05, 0.35 * g, 260 * p);
      a.ping(t, 720 * p, 0.025, 0.12 * g);
      if (kind !== 'key') a.ping(t, 200 * p, 0.06, 0.25 * g);
    },
    up(a, t, p, g) {
      a.noise(t, { kind: 'brown', type: 'lowpass', freq: 1200 * p, dur: 0.03, gain: 0.2 * g });
    },
  },

  // Máquina de escrever: pancada metálica inarmónica + corpo + papel; Enter = alavanca do carro.
  typewriter: {
    down(a, t, p, g, kind) {
      if (kind === 'enter') {
        a.noise(t, { freq: 600, freqEnd: 2600, q: 1.2, dur: 0.26, gain: 0.35 * g });
        a.noise(t + 0.26, { freq: 1600, q: 1, dur: 0.04, gain: 0.5 * g });
        a.ping(t + 0.26, 110, 0.12, 0.5 * g, 70);
        return;
      }
      a.noise(t, { freq: 3000 * p, q: 1.2, dur: 0.018, gain: 0.8 * g });
      a.ping(t, 1180 * p, 0.05, 0.22 * g);
      a.ping(t, 2730 * p, 0.035, 0.14 * g);
      a.ping(t, 4900 * p, 0.02, 0.07 * g);
      a.ping(t, 95 * p, 0.08, 0.6 * g, 70 * p);
      a.noise(t, { kind: 'brown', type: 'lowpass', freq: 700 * p, dur: 0.07, gain: 0.6 * g });
      a.noise(t + 0.012, { freq: 1500 * p, q: 0.8, dur: 0.02, gain: 0.25 * g });
    },
    up(a, t, p, g, kind) {
      if (kind === 'enter') return;
      a.noise(t, { freq: 2000 * p, q: 1, dur: 0.008, gain: 0.1 * g });
    },
  },

  // Toque de telemóvel: tique háptico suave.
  phone: {
    down(a, t, p, g) {
      a.ping(t, 1500 * p, 0.03, 0.4 * g, 950 * p);
      a.noise(t, { freq: 2600 * p, q: 1.5, dur: 0.012, gain: 0.18 * g });
      a.ping(t, 180 * p, 0.04, 0.2 * g);
    },
  },
};
