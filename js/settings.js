// Preferências e roteiros guardados em localStorage (sempre com try/catch:
// pode estar bloqueado em modo privado). Nunca se guarda vídeo, avatar ou áudio.

const KEY_SETTINGS = 'digita:settings:v1';
const KEY_SCRIPTS = 'digita:scripts:v1';
const KEY_LAST = 'digita:last-script:v1';
const KEY_SEEN = 'digita:seen-howto:v1';

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function lsJSON(key, fallback) {
  const raw = lsGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export const SAMPLE_SCRIPT = ['Hello world!', 'blah blah blah', "Hey, what's up? It's Takuya here. Long time no see!"].join('\n');

export const DEFAULTS = {
  lang: 'pt',
  theme: 'ios-light',
  custom: {
    leftBg: '#E9E9EB',
    leftText: '#111111',
    rightBg: '#0A84FF',
    rightText: '#FFFFFF',
    font: 'system',
    radius: 34,
    tail: 'curl',
    shadow: false,
  },
  layout: { fontSize: 42, maxWidth: 760, marginX: 64, marginY: 64, maxVisible: 4, replyPlacement: 'column' },
  timing: {
    mode: 'typewriter',
    cps: 14,
    showTyping: true,
    typingDuration: 1.2,
    pauseBetween: 0.8,
    startDelay: 1,
    endWait: 2,
    blankPause: 1.2,
  },
  avatar: { show: false, name: '', showName: false, nameColor: '#111111', size: 84 },
  background: { type: 'green', custom: '#00B140' },
  sound: {
    preset: 'thocky',
    volume: 0.7,
    pitchVar: 0.35,
    timingVar: 0.35,
    spaceEnterDiff: true,
    sentSound: true,
    ding: true,
  },
  present: { countdown: true, hideCursor: true },
  record: { format: '16:9', fps: 30, mute: false },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Junta valores guardados com os defaults, aceitando só chaves e tipos conhecidos. */
function merge(base, saved) {
  const out = {};
  for (const key of Object.keys(base)) {
    const b = base[key];
    const s = saved?.[key];
    if (isObj(b)) out[key] = merge(b, isObj(s) ? s : {});
    else out[key] = typeof s === typeof b ? s : b;
  }
  return out;
}

export class Settings {
  constructor() {
    this.data = merge(DEFAULTS, lsJSON(KEY_SETTINGS, {}));
    if (this.data.sound.preset === 'custom') this.data.sound.preset = DEFAULTS.sound.preset; // o ficheiro não persiste
    this.listeners = new Set();
    this._timer = null;
  }

  get(path) {
    return path.split('.').reduce((o, k) => o?.[k], this.data);
  }

  set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], this.data);
    if (target[last] === value) return;
    target[last] = value;
    for (const fn of this.listeners) fn(path, value);
    this._scheduleSave();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  reset() {
    this.data = merge(DEFAULTS, {});
    for (const fn of this.listeners) fn('*', null);
    this._scheduleSave();
  }

  _scheduleSave() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => lsSet(KEY_SETTINGS, JSON.stringify(this.data)), 250);
  }
}

/** Roteiros guardados pelo utilizador: { [nome]: texto } */
export const ScriptStore = {
  all() {
    const v = lsJSON(KEY_SCRIPTS, {});
    return isObj(v) ? v : {};
  },
  names() {
    return Object.keys(this.all()).sort((a, b) => a.localeCompare(b));
  },
  get(name) {
    const v = this.all()[name];
    return typeof v === 'string' ? v : null;
  },
  save(name, text) {
    const all = this.all();
    all[name] = text;
    return lsSet(KEY_SCRIPTS, JSON.stringify(all));
  },
  remove(name) {
    const all = this.all();
    delete all[name];
    lsSet(KEY_SCRIPTS, JSON.stringify(all));
  },
  loadCurrent() {
    const v = lsGet(KEY_LAST);
    return v === null ? SAMPLE_SCRIPT : v;
  },
  saveCurrent(text) {
    lsSet(KEY_LAST, text);
  },
};

export const Onboarding = {
  seen: () => lsGet(KEY_SEEN) === '1',
  markSeen: () => lsSet(KEY_SEEN, '1'),
};
