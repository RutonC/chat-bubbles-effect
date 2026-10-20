// Relógio de reprodução: avança t, dispara os sons (teclas, "enviado") e avisa
// quando acaba. O desenho em si é feito por quem usa o player (onFrame).
import { revealCount } from './timeline.js';

export class Player {
  /**
   * @param {{onFrame:(t:number)=>void, onSound:(kind:string, delay:number)=>void, onState:(s:string)=>void, onEnd:()=>void}} hooks
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

  _fireSounds(t) {
    const msgs = this.tl.msgs;
    const keys = [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.textStart > t) break;
      if (!m.instant) {
        const n = revealCount(m, t);
        for (let k = this._shown[i]; k < n; k++) keys.push(m.chars[k] === ' ' ? 'space' : 'key');
        this._shown[i] = n;
      }
      if (!this._sent[i] && t >= m.textEnd) {
        this._sent[i] = true;
        if (!m.instant) keys.push('enter');
        keys.push('sent');
        keys.push('ding');
      }
    }
    // após um salto de tempo (separador em segundo plano) evita uma rajada de sons
    const list = keys.length > 8 ? keys.slice(-8) : keys;
    list.forEach((kind, i) => this.hooks.onSound(kind, i * 0.014));
  }
}
