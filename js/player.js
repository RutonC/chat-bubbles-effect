// Relógio de reprodução: avança t, dispara os sons (teclas, "enviado") e avisa
// quando acaba. O desenho em si é feito por quem usa o player (onFrame).
import { revealCount } from './timeline.js';

export class Player {
  /**
   * @param {{onFrame:(t:number)=>void, onSound:(kind:string, delay:number, char:string)=>void, onState:(s:string)=>void, onEnd:()=>void}} hooks
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.tl = null;
    this.state = 'idle'; // idle | playing | paused | finished
    this.t = 0;
    this._t0 = 0;
    this._pausedAt = 0;
    this._raf = 0;
    this._shown = [];
    this._sent = [];
    this._loop = this._loop.bind(this);
  }

  setTimeline(tl) {
    this.tl = tl;
  }

  start() {
    if (!this.tl || !this.tl.msgs.length) return false;
    this.t = 0;
    this._t0 = performance.now();
    this._shown = this.tl.msgs.map(() => 0);
    this._sent = this.tl.msgs.map(() => false);
    this._setState('playing');
    this._schedule();
    return true;
  }

  pause() {
    if (this.state !== 'playing') return;
    this._pausedAt = performance.now();
    this._setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this._t0 += performance.now() - this._pausedAt;
    this._setState('playing');
    this._schedule();
  }

  toggle() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
    else this.start();
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.t = 0;
    this._setState('idle');
  }

  _setState(s) {
    this.state = s;
    this.hooks.onState(s);
  }

  _schedule() {
    if (!this._raf) this._raf = requestAnimationFrame(this._loop);
  }

  _loop(now) {
    this._raf = 0;
    if (this.state !== 'playing') return;
    const total = this.tl.total;
    this.t = Math.min((now - this._t0) / 1000, total);
    this._fireSounds(this.t);
    this.hooks.onFrame(this.t);
    if (this.t >= total) {
      this._setState('finished');
      this.hooks.onEnd();
      return;
    }
    this._schedule();
  }

  // Os sons são agendados com uma pequena antecipação (LOOK) e o atraso exato de
  // cada letra, para não ficarem "arredondados" ao fotograma (~16 ms).
  _fireSounds(t) {
    const LOOK = 0.12;
    const ahead = t + LOOK;
    const msgs = this.tl.msgs;
    const events = [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.textStart > ahead) break;
      if (!m.instant) {
        const n = revealCount(m, ahead);
        for (let k = this._shown[i]; k < n; k++) {
          const ch = m.chars[k];
          events.push([ch === ' ' ? 'space' : 'key', Math.max(0, m.charTimes[k] - t), ch]);
        }
        this._shown[i] = n;
      }
      if (!this._sent[i] && ahead >= m.textEnd) {
        this._sent[i] = true;
        const d = Math.max(0, m.textEnd - t);
        if (!m.instant) events.push(['enter', d, '']);
        events.push(['sent', d + 0.02, ''], ['ding', d + 0.02, '']);
      }
    }
    // após um salto de tempo (separador em segundo plano) evita uma rajada de sons
    for (const [kind, delay, ch] of events.length > 12 ? events.slice(-12) : events) this.hooks.onSound(kind, delay, ch);
  }
}
