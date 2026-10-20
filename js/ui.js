// Peças de interface: avisos, descarregar ficheiros e o painel de configurações,
// gerado a partir de uma descrição declarativa dos campos.
import { t } from './i18n.js';
import { FONTS } from './renderer.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(message, ms = 2800) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 350);
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const FPS = [30, 60];

// type: select | range | color | toggle | text | custom:<nome>
const SECTIONS = [
  {
    id: 'look',
    open: true,
    fields: [
      { type: 'select', path: 'theme', options: ['ios-light', 'ios-dark', 'whatsapp', 'minimal', 'custom'], optKey: (v) => `o.theme.${v}` },
      { type: 'color', path: 'custom.leftBg', showIf: (s) => s.theme === 'custom' },
      { type: 'color', path: 'custom.leftText', showIf: (s) => s.theme === 'custom' },
      { type: 'color', path: 'custom.rightBg', showIf: (s) => s.theme === 'custom' },
      { type: 'color', path: 'custom.rightText', showIf: (s) => s.theme === 'custom' },
      { type: 'select', path: 'custom.font', options: Object.keys(FONTS), optKey: (v) => `o.font.${v}`, showIf: (s) => s.theme === 'custom' },
      { type: 'range', path: 'custom.radius', min: 0, max: 80, step: 1, unit: 'px', showIf: (s) => s.theme === 'custom' },
      { type: 'select', path: 'custom.tail', options: ['curl', 'corner', 'none'], optKey: (v) => `o.tail.${v}`, showIf: (s) => s.theme === 'custom' },
      { type: 'toggle', path: 'custom.shadow', showIf: (s) => s.theme === 'custom' },
      { type: 'range', path: 'layout.fontSize', min: 24, max: 90, step: 1, unit: 'px' },
      { type: 'range', path: 'layout.maxWidth', min: 300, max: 1400, step: 10, unit: 'px' },
      { type: 'range', path: 'layout.marginX', min: 0, max: 400, step: 4, unit: 'px' },
      { type: 'range', path: 'layout.marginY', min: 0, max: 400, step: 4, unit: 'px' },
      { type: 'range', path: 'layout.maxVisible', min: 1, max: 10, step: 1 },
      { type: 'range', path: 'layout.hideAfter', min: 0, max: 30, step: 0.5, unit: 's' },
      { type: 'select', path: 'layout.replyPlacement', options: ['column', 'edge'], optKey: (v) => `o.reply.${v}` },
    ],
  },
  {
    id: 'avatar',
    fields: [
      { type: 'toggle', path: 'avatar.show' },
      { type: 'custom', name: 'avatarUpload', showIf: (s) => s.avatar.show },
      { type: 'range', path: 'avatar.size', min: 40, max: 200, step: 2, unit: 'px', showIf: (s) => s.avatar.show },
      { type: 'toggle', path: 'avatar.showName' },
      { type: 'text', path: 'avatar.name', max: 40 },
      { type: 'color', path: 'avatar.nameColor' },
    ],
  },
  {
    id: 'timing',
    fields: [
      { type: 'select', path: 'timing.mode', options: ['typewriter', 'instant'], optKey: (v) => `o.mode.${v}` },
      { type: 'range', path: 'timing.cps', min: 3, max: 60, step: 1, showIf: (s) => s.timing.mode === 'typewriter' },
      { type: 'toggle', path: 'timing.showTyping' },
      { type: 'range', path: 'timing.typingDuration', min: 0.2, max: 4, step: 0.1, unit: 's', showIf: (s) => s.timing.showTyping },
      { type: 'range', path: 'timing.pauseBetween', min: 0, max: 5, step: 0.1, unit: 's' },
      { type: 'range', path: 'timing.startDelay', min: 0, max: 10, step: 0.1, unit: 's' },
      { type: 'range', path: 'timing.endWait', min: 0, max: 10, step: 0.1, unit: 's' },
      { type: 'range', path: 'timing.blankPause', min: 0, max: 5, step: 0.1, unit: 's' },
    ],
  },
  {
    id: 'sound',
    fields: [
      { type: 'custom', name: 'sounds' },
      { type: 'range', path: 'sound.volume', min: 0, max: 1, step: 0.01, percent: true },
      { type: 'range', path: 'sound.pitchVar', min: 0, max: 1, step: 0.01, percent: true },
      { type: 'range', path: 'sound.timingVar', min: 0, max: 1, step: 0.01, percent: true },
      { type: 'range', path: 'sound.room', min: 0, max: 1, step: 0.01, percent: true },
      { type: 'range', path: 'sound.offset', min: -150, max: 150, step: 5, unit: 'ms' },
      { type: 'toggle', path: 'sound.release' },
      { type: 'toggle', path: 'sound.spaceEnterDiff' },
      { type: 'toggle', path: 'sound.sentSound' },
      { type: 'toggle', path: 'sound.ding', showIf: (s) => s.sound.preset === 'typewriter' },
      { type: 'custom', name: 'soundUpload' },
    ],
  },
  {
    id: 'bg',
    fields: [
      { type: 'select', path: 'background.type', options: ['green', 'blue', 'black', 'custom', 'transparent'], optKey: (v) => `o.bg.${v}` },
      { type: 'color', path: 'background.custom', showIf: (s) => s.background.type === 'custom' },
      { type: 'note', key: 'bg.transparentNote', showIf: (s) => s.background.type === 'transparent' },
    ],
  },
  {
    id: 'present',
    fields: [
      { type: 'toggle', path: 'present.countdown' },
      { type: 'toggle', path: 'present.hideCursor' },
    ],
  },
  {
    id: 'record',
    fields: [
      { type: 'select', path: 'record.format', options: ['16:9', '9:16', '1:1'], optKey: (v) => `o.format.${v}` },
      { type: 'select', path: 'record.fps', options: FPS },
      { type: 'select', path: 'record.prefer', options: ['webm', 'mp4'], optKey: (v) => `o.prefer.${v}` },
      { type: 'toggle', path: 'record.mute' },
      { type: 'custom', name: 'recordInfo' },
    ],
  },
  {
    id: 'general',
    fields: [{ type: 'custom', name: 'general' }],
  },
];

/**
 * Constrói o painel dentro de `host`.
 * api: { settings, audio, languages, testSound, avatarFile, avatarClear, soundFile, soundClear,
 *        recordInfo, record, reset, setLang }
 */
export function buildPanel(host, api) {
  const { settings, audio } = api;
  const openSections = new Set(SECTIONS.filter((s) => s.open).map((s) => s.id));
  let visibilityRules = [];
  let recordInfoEl = null;

  const labelOf = (path) => t(`f.${path}`);

  function el(tag, props = {}, ...kids) {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  }

  function control(f) {
    const value = settings.get(f.path);
    const wrap = el('div', { className: 'field' });
    const id = `f-${f.path.replace(/\W/g, '-')}`;
    const label = el('label', { htmlFor: id, textContent: labelOf(f.path) });

    if (f.type === 'toggle') {
      const input = el('input', { type: 'checkbox', id, checked: !!value });
      input.addEventListener('change', () => settings.set(f.path, input.checked));
      wrap.append(el('div', { className: 'row' }, label, input));
    } else if (f.type === 'range') {
      const out = el('output', { htmlFor: id });
      const show = (v) => (out.value = f.percent ? `${Math.round(v * 100)}%` : `${v}${f.unit ? ' ' + f.unit : ''}`);
      const input = el('input', { type: 'range', id, min: f.min, max: f.max, step: f.step, value });
      show(value);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        show(v);
        settings.set(f.path, v);
      });
      wrap.append(el('div', { className: 'row' }, label, out), input);
    } else if (f.type === 'color') {
      const input = el('input', { type: 'color', id, value });
      input.addEventListener('input', () => settings.set(f.path, input.value));
      wrap.append(el('div', { className: 'row' }, label, input));
    } else if (f.type === 'text') {
      const input = el('input', { type: 'text', id, value, maxLength: f.max || 60 });
      input.addEventListener('input', () => settings.set(f.path, input.value));
      wrap.append(label, input);
    } else if (f.type === 'select') {
      const select = el('select', { id });
      for (const opt of f.options) {
        select.append(el('option', { value: String(opt), textContent: f.optKey ? t(f.optKey(opt)) : String(opt), selected: opt === value }));
      }
      select.addEventListener('change', () => settings.set(f.path, typeof value === 'number' ? Number(select.value) : select.value));
      wrap.append(label, select);
    }
    return wrap;
  }

  const CUSTOM = {
    avatarUpload() {
      const input = el('input', { type: 'file', accept: 'image/*' });
      input.addEventListener('change', () => input.files[0] && api.avatarFile(input.files[0]));
      const up = el('label', { className: 'btn small' }, input, t('f.avatar.upload'));
      const clear = el('button', { type: 'button', className: 'btn small', textContent: t('f.avatar.clear') });
      clear.addEventListener('click', () => api.avatarClear());
      return el('div', { className: 'field' }, el('div', { className: 'file-btn' }, up, clear), el('p', { className: 'note', textContent: t('avatar.note') }));
    },

    sounds() {
      const list = el('div', { className: 'presets', role: 'radiogroup' });
      list.append(el('div', { className: 'label', textContent: t('f.sound.preset') }));
      const presets = ['clicky', 'thocky', 'membrane', 'typewriter', 'phone', 'none'];
      if (audio.hasCustom) presets.push('custom');
      for (const p of presets) {
        const radio = el('input', { type: 'radio', name: 'preset', value: p, checked: settings.get('sound.preset') === p });
        radio.addEventListener('change', () => settings.set('sound.preset', p));
        const test = el('button', { type: 'button', className: 'btn small', textContent: '▶ ' + t('sound.test') });
        test.addEventListener('click', () => api.testSound(p));
        list.append(el('div', { className: 'preset' }, el('label', {}, radio, t(`o.preset.${p}`)), test));
      }
      return list;
    },

    soundUpload() {
      const input = el('input', { type: 'file', accept: 'audio/mpeg,audio/wav,audio/x-wav,audio/*' });
      input.addEventListener('change', () => input.files[0] && api.soundFile(input.files[0]));
      const up = el('label', { className: 'btn small' }, input, t('f.sound.custom'));
      const clear = el('button', { type: 'button', className: 'btn small', textContent: t('f.sound.customClear'), hidden: !audio.hasCustom });
      clear.addEventListener('click', () => api.soundClear());
      return el('div', { className: 'field' }, el('div', { className: 'file-btn' }, up, clear), el('p', { className: 'note', textContent: t('sound.note') }));
    },

    recordInfo() {
      recordInfoEl = el('div', { className: 'rec-info' });
      const btn = el('button', { type: 'button', className: 'btn primary', textContent: t('record.start') });
      btn.addEventListener('click', () => api.record());
      const wrap = el('div', { className: 'field' }, recordInfoEl, btn);
      return wrap;
    },

    general() {
      const select = el('select', { id: 'f-lang' });
      for (const [code, name] of Object.entries(api.languages)) select.append(el('option', { value: code, textContent: name, selected: code === settings.get('lang') }));
      select.addEventListener('change', () => api.setLang(select.value));
      const reset = el('button', { type: 'button', className: 'btn', textContent: t('f.reset') });
      reset.addEventListener('click', () => api.reset());
      return el('div', { className: 'field' }, el('label', { htmlFor: 'f-lang', textContent: t('f.lang') }), select, reset);
    },
  };

  function render() {
    host.replaceChildren();
    visibilityRules = [];
    for (const sec of SECTIONS) {
      const details = el('details', { className: 'sec', open: openSections.has(sec.id) });
      details.addEventListener('toggle', () => (details.open ? openSections.add(sec.id) : openSections.delete(sec.id)));
      const body = el('div', { className: 'sec-body' });
      for (const f of sec.fields) {
        let node;
        if (f.type === 'custom') node = CUSTOM[f.name]();
        else if (f.type === 'note') node = el('p', { className: 'note', textContent: t(f.key) });
        else node = control(f);
        if (f.showIf) visibilityRules.push([node, f.showIf]);
        body.append(node);
      }
      details.append(el('summary', { textContent: t(`sec.${sec.id}`) }), body);
      host.append(details);
    }
    refresh();
  }

  function refresh() {
    for (const [node, rule] of visibilityRules) node.hidden = !rule(settings.data);
    if (recordInfoEl) recordInfoEl.innerHTML = api.recordInfo();
  }

  return { render, refresh };
}
