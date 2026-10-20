// Sessão "ao vivo": o utilizador escreve no teclado e a linha do tempo cresce em
// tempo real, com a mesma estrutura que o renderer já sabe desenhar. Cada tecla
// fica registada com o seu instante, por isso o som e a letra são simultâneos.

export class LiveSession {
  constructor() {
    this.reset();
  }

  reset() {
    this.t0 = performance.now();
    this.timeline = { msgs: [], total: Infinity, lastTextEnd: 0, previewT: 0 };
    this.draft = null;
  }

  /** Segundos desde o início da sessão. */
  now() {
    return (performance.now() - this.t0) / 1000;
  }

  get hasMessages() {
    return this.timeline.msgs.length > 0;
  }

  _ensureDraft() {
    if (this.draft) return this.draft;
    const t = this.now();
    const m = {
      index: this.timeline.msgs.length,
      side: 'left',
      speed: 'normal',
      instant: false,
      live: true,
      version: 0,
      chars: [],
      enterT: t,
      textStart: t,
      charTimes: [],
      textEnd: Infinity,
    };
    this.timeline.msgs.push(m);
    this.draft = m;
    return m;
  }

  /** Acrescenta um caractere. ">" no início da mensagem alterna para a resposta (lado direito). */
  type(ch) {
    if (/^\s$/.test(ch) && ch !== '\n' && !(this.draft?.chars.length)) return; // sem espaços no início
    const m = this._ensureDraft();
    if (ch === '>' && m.chars.length === 0) {
      m.side = m.side === 'left' ? 'right' : 'left';
    } else {
      m.chars.push(ch);
      m.charTimes.push(this.now());
    }
    m.version++;
  }

  backspace() {
    const m = this.draft;
    if (!m) return false;
    if (m.chars.length) {
      m.chars.pop();
      m.charTimes.pop();
      m.version++;
    } else {
      this.timeline.msgs.pop(); // rascunho vazio: cancela o balão
      this.draft = null;
    }
    return true;
  }

  /** Envia a mensagem em curso. Devolve false se não havia texto. */
  send() {
    const m = this.draft;
    if (!m || m.chars.length === 0) return false;
    m.textEnd = this.now();
    this.timeline.lastTextEnd = m.textEnd;
    this.draft = null;
    return true;
  }
}
