// Ponto de entrada: liga os módulos (settings, parser, timeline, renderer, audio,
// recorder, ui) e trata dos dois modos de uso (apresentação e gravação).
import { Settings, ScriptStore, Onboarding } from './settings.js';
import { parseScript, formatDuration } from './script-parser.js';
import { buildTimeline } from './timeline.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { Player } from './player.js';
import { LiveSession } from './live.js';
import { VideoRecorder, FORMATS, pickFormat, fileName } from './recorder.js';
import { LANGUAGES, setLang, applyI18n, t } from './i18n.js';
import { $, toast, downloadBlob, buildPanel } from './ui.js';

const settings = new Settings();
setLang(settings.get('lang'));

const canvas = $('#stage');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const recorder = new VideoRecorder(canvas, audio);
const body = document.body;

let scriptText = ScriptStore.loadCurrent();
let timeline = null;
let pendingRebuild = false;
let counting = false;
let cdToken = 0;
const state = { clean: false, recording: false, wasClean: false, rec: null, live: false };
const live = new LiveSession();
let liveRaf = 0;
const liveInput = $('#liveInput');
let preview = null; // { blob, url, name }

// ---------- linha do tempo e reprodução ----------

function timingConfig() {
  return { ...settings.get('timing'), jitter: settings.get('sound.timingVar') };
}

function rebuild() {
  pendingRebuild = false;
  timeline = buildTimeline(parseScript(scriptText), timingConfig());
  player.setTimeline(timeline);
  redraw();
}

function requestRebuild() {
  if (player.state === 'playing' || player.state === 'paused') pendingRebuild = true;
  else rebuild();
}

const player = new Player({
  onFrame: (tm) => renderer.draw(timeline, tm),
  onSound: (kind, delay, ch) => audio.play(kind, undefined, delay, ch),
  onState: () => syncPlayUI(),
  onEnd: () => {
    if (state.recording) finishRecording();
  },
});

function redraw() {
  if (state.live) return renderer.draw(live.timeline, live.now());
  if (player.state === 'playing') return;
  if (!timeline) return;
  const tm = player.state === 'idle' ? (timeline.msgs.length ? timeline.previewT : -1) : player.t;
  renderer.draw(timeline, tm);
}

function hasMessages() {
  if (!timeline?.msgs.length) {
    toast(t('toast.emptyScript'));
    return false;
  }
  return true;
}

function runCountdown(n) {
  const token = ++cdToken;
  const box = $('#countdown');
  counting = true;
  return new Promise((resolve) => {
    let i = n;
    const step = () => {
      if (token !== cdToken) return resolve(false);
      if (i === 0) {
        box.hidden = true;
        counting = false;
        return resolve(true);
      }
      const span = document.createElement('span');
      span.textContent = String(i--);
      box.replaceChildren(span);
      box.hidden = false;
      setTimeout(step, 1000);
    };
    step();
  });
}

function cancelCountdown() {
  cdToken++;
  counting = false;
  $('#countdown').hidden = true;
}

async function startPlayback({ countdown = false } = {}) {
  if (state.live) setLive(false);
  rebuild();
  if (!hasMessages()) return;
  audio.ensure();
  player.stop();
  if (countdown) {
    renderer.draw(timeline, -1);
    if (!(await runCountdown(3))) return;
  }
  player.start();
}

function togglePlay() {
  if (state.live) return startPlayback();
  if (counting) {
    cancelCountdown();
    redraw();
  } else if (player.state === 'playing' || player.state === 'paused') {
    player.toggle();
  } else {
    startPlayback({ countdown: state.clean && settings.get('present.countdown') });
  }
}

function restart() {
  cancelCountdown();
  startPlayback({ countdown: state.clean && settings.get('present.countdown') });
}

function syncPlayUI() {
  const s = player.state;
  const label = s === 'playing' ? 'top.pause' : s === 'paused' ? 'top.resume' : 'top.play';
  const icon = s === 'playing' ? '#i-pause' : '#i-play';
  $('#btnPlayLabel').textContent = t(label);
  $('#btnPlay use').setAttribute('href', icon);
  $('#cbPlay use').setAttribute('href', icon);
  body.classList.toggle('hide-cursor', s === 'playing' && settings.get('present.hideCursor'));
  if (s === 'idle' || s === 'finished') redraw();
}

// ---------- palco ----------

function layoutStage() {
  const wrap = $('#stageWrap');
  const frame = $('#stageFrame');
  const cs = getComputedStyle(wrap);
  const boxW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const boxH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (boxW <= 0 || boxH <= 0) return;

  const fmt = FORMATS[settings.get('record.format')] || FORMATS['16:9'];
  const fill = state.clean && !state.recording;
  const ratio = fmt.w / fmt.h;
  let cssW = boxW;
  let cssH = boxH;
  if (!fill) {
    cssW = Math.min(boxW, boxH * ratio);
    cssH = cssW / ratio;
  }
  frame.style.width = `${Math.floor(cssW)}px`;
  frame.style.height = `${Math.floor(cssH)}px`;
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const dpr = window.devicePixelRatio || 1;
  let bw;
  let bh;
  if (state.recording) {
    bw = fmt.w;
    bh = fmt.h;
  } else if (fill) {
    const k = Math.min(1, 2560 / Math.max(cssW * dpr, cssH * dpr));
    bw = Math.round(cssW * dpr * k);
    bh = Math.round(cssH * dpr * k);
  } else {
    bw = Math.min(fmt.w, Math.round(cssW * dpr));
    bh = Math.round(bw / ratio);
  }
  renderer.setSize(Math.max(2, bw), Math.max(2, bh));
  frame.classList.toggle('checker', settings.get('background.type') === 'transparent' && !state.clean);
  redraw();
}

async function setClean(on, { fullscreen = true } = {}) {
  if (on === state.clean) return;
  state.clean = on;
  body.classList.toggle('clean', on);
  if (on) {
    if (fullscreen && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        /* sem ecrã inteiro: o modo limpo funciona na mesma */
      }
    }
    if (!state.recording) {
      toast(t('toast.cleanHint'), 3500);
      showBar();
    }
  } else {
    cancelCountdown();
    body.classList.remove('bar-visible');
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignorar */
      }
    }
  }
  layoutStage();
  updateLiveHint();
  if (state.live) liveInput.focus();
}

let barTimer = 0;
function showBar() {
  if (!state.clean || state.recording) return;
  body.classList.add('bar-visible');
  clearTimeout(barTimer);
  barTimer = setTimeout(() => body.classList.remove('bar-visible'), 2200);
}

// ---------- gravação ----------

function recordSetup() {
  const withAudio = !settings.get('record.mute');
  const transparent = settings.get('background.type') === 'transparent';
  return { withAudio, transparent };
}

async function startRecording() {
  if (state.recording) return;
  if (!state.live) {
    rebuild();
    if (!hasMessages()) return;
  }
  let { withAudio, transparent } = recordSetup();
  if (withAudio && !audio.ensure()) {
    toast(t('toast.noAudio'));
    withAudio = false;
  }
  let format = pickFormat({ withAudio, transparent });
  if (transparent && !format) {
    toast(t('toast.transparentFallback'), 4500);
    transparent = false;
    renderer.bgOverride = '#00B140';
    format = pickFormat({ withAudio, transparent });
  }
  if (!format) {
    renderer.bgOverride = undefined;
    toast(t('toast.noRecorder'), 4500);
    return;
  }

  cancelCountdown();
  player.stop();
  state.recording = true;
  state.wasClean = state.clean;
  state.rec = { format, withAudio, transparent, hidden: false, fps: settings.get('record.fps'), live: state.live };
  body.classList.add('recording');
  await setClean(true, { fullscreen: false });
  body.classList.remove('bar-visible');
  layoutStage();
  if (state.live) live.reset();
  renderer.draw(state.live ? live.timeline : timeline, -1);
  updateLiveHint();

  const ok = await runCountdown(3);
  if (!ok || !state.recording) return;
  try {
    recorder.start({ fps: state.rec.fps, withAudio, format });
  } catch (err) {
    console.error(err);
    toast(t('toast.recFail'));
    exitRecordingMode();
    return;
  }
  if (state.live) {
    live.reset(); // o relógio começa quando a gravação começa
    liveInput.focus();
  } else player.start();
}

async function finishRecording() {
  if (!state.recording || state.rec.finishing) return;
  const info = state.rec;
  info.finishing = true;
  if (info.live) await new Promise((r) => setTimeout(r, settings.get('timing.endWait') * 1000));
  else renderer.draw(timeline, player.t);
  await new Promise((r) => setTimeout(r, 250)); // deixa o último fotograma entrar no vídeo
  let blob;
  try {
    blob = await recorder.stop();
    player.stop();
  } catch (err) {
    player.stop();
    console.error(err);
    toast(t('toast.recFail'));
    exitRecordingMode();
    return;
  }
  exitRecordingMode();
  showPreview(blob, info);
}

function cancelRecording() {
  recorder.cancel();
  player.stop();
  cancelCountdown();
  exitRecordingMode();
  toast(t('toast.recCancelled'));
}

function exitRecordingMode() {
  state.recording = false;
  updateLiveHint();
  state.rec = null;
  renderer.bgOverride = undefined;
  body.classList.remove('recording');
  if (!state.wasClean) setClean(false);
  else layoutStage();
  if (state.live) liveInput.focus();
}

function showPreview(blob, info) {
  const url = URL.createObjectURL(blob);
  const name = fileName(info.format.ext);
  preview = { blob, url, name };
  const video = $('#previewVideo');
  video.src = url;
  const size = blob.size > 1e6 ? `${(blob.size / 1e6).toFixed(1)} MB` : `${Math.round(blob.size / 1e3)} kB`;
  $('#previewInfo').textContent = t('rec.info', { fmt: info.format.label, size, name });
  const warn = $('#previewWarn');
  const notes = [];
  if (info.hidden) notes.push(t('rec.hiddenWarn'));
  if (info.transparent) notes.push(t('rec.transparentNote'));
  warn.textContent = notes.join(' ');
  warn.hidden = notes.length === 0;
  $('#dlgPreview').showModal();
}

function releasePreview() {
  if (!preview) return;
  const video = $('#previewVideo');
  video.pause();
  video.removeAttribute('src');
  video.load();
  URL.revokeObjectURL(preview.url);
  preview = null;
}

$('#previewDownload').addEventListener('click', () => {
  if (!preview) return;
  downloadBlob(preview.blob, preview.name);
  $('#dlgPreview').close();
});
$('#previewDiscard').addEventListener('click', () => $('#dlgPreview').close());
$('#dlgPreview').addEventListener('close', releasePreview);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.recording && state.rec && recorder.active) state.rec.hidden = true;
});

// ---------- escrever ao vivo ----------

function updateLiveHint() {
  $('#liveHint').hidden = !(state.live && !state.clean && !state.recording && !live.hasMessages);
}

function liveLoop() {
  if (!state.live) return;
  renderer.draw(live.timeline, live.now());
  updateLiveHint();
  liveRaf = requestAnimationFrame(liveLoop);
}

function setLive(on) {
  if (on === state.live) return;
  state.live = on;
  body.classList.toggle('live', on);
  $('#btnLive').setAttribute('aria-pressed', String(on));
  cancelAnimationFrame(liveRaf);
  if (on) {
    cancelCountdown();
    player.stop();
    live.reset();
    audio.ensure();
    liveInput.focus();
    liveLoop();
  } else {
    liveInput.blur();
    updateLiveHint();
    redraw();
  }
}

const pressed = new Map(); // e.code -> kind (para o som de soltar)

function liveSend() {
  if (!live.send()) return;
  audio.play('enter', undefined, 0, '', { autoRelease: false });
  audio.play('sent', undefined, 0.02);
  audio.play('ding', undefined, 0.02);
}

liveInput.addEventListener('keydown', (e) => {
  if (!state.live || e.ctrlKey || e.metaKey || e.altKey || e.key === 'Escape' || e.isComposing) return;
  const key = e.key;
  if (key === 'Unidentified' || key === 'Process' || key === 'Dead') return; // tratado em beforeinput
  if (key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) {
      live.type('\n');
      audio.play('enter', undefined, 0, '', { autoRelease: false });
    } else liveSend();
    if (!pressed.has(e.code)) pressed.set(e.code, 'enter');
  } else if (key === 'Backspace') {
    e.preventDefault();
    if (live.backspace()) audio.play('key', undefined, 0, '\b', { autoRelease: false });
    pressed.set(e.code, 'key');
  } else if ([...key].length === 1) {
    e.preventDefault();
    const kind = key === ' ' ? 'space' : 'key';
    live.type(key);
    audio.play(kind, undefined, 0, key, { autoRelease: false });
    pressed.set(e.code, kind);
  }
});
liveInput.addEventListener('keyup', (e) => {
  const kind = pressed.get(e.code);
  if (kind) {
    pressed.delete(e.code);
    audio.release(kind);
  }
});
liveInput.addEventListener('blur', () => pressed.clear());
// Teclados de telemóvel, IME e colar: não têm keydown fiável.
liveInput.addEventListener('beforeinput', (e) => {
  if (!state.live) return;
  e.preventDefault();
  if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') liveSend();
  else if (e.inputType === 'deleteContentBackward') {
    if (live.backspace()) audio.play('key', undefined, 0, '\b');
  } else {
    const text = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
    for (const ch of text) live.type(ch === '\n' ? '\n' : ch);
    if (text) audio.play(text === ' ' ? 'space' : 'key', undefined, 0, text[0]);
  }
});

// ---------- roteiro (modal) ----------

const dlgScript = $('#dlgScript');
const scriptTextEl = $('#scriptText');
const scriptNameEl = $('#scriptName');
const scriptPick = $('#scriptPick');

function updateScriptStats() {
  const tl = buildTimeline(parseScript(scriptTextEl.value), timingConfig());
  $('#scriptStats').textContent = tl.msgs.length ? t('script.stats', { n: tl.msgs.length, d: formatDuration(tl.total) }) : t('script.statsEmpty');
}

function refreshScriptPick() {
  scriptPick.replaceChildren(new Option(t('script.pick'), ''));
  for (const name of ScriptStore.names()) scriptPick.append(new Option(name, name));
}

function openScript() {
  scriptTextEl.value = scriptText;
  dlgScript.returnValue = '';
  refreshScriptPick();
  updateScriptStats();
  dlgScript.showModal();
  scriptTextEl.focus();
}

scriptTextEl.addEventListener('input', updateScriptStats);
dlgScript.addEventListener('close', () => {
  if (dlgScript.returnValue !== 'start') return;
  scriptText = scriptTextEl.value;
  ScriptStore.saveCurrent(scriptText);
  startPlayback();
});

function saveScript() {
  const name = scriptNameEl.value.trim();
  if (!name) return scriptNameEl.focus();
  toast(ScriptStore.save(name, scriptTextEl.value) ? t('script.saved') : t('script.saveFail'));
  refreshScriptPick();
  scriptPick.value = name;
}
$('#scriptSave').addEventListener('click', saveScript);
scriptNameEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveScript();
  }
});
$('#scriptLoad').addEventListener('click', () => {
  const name = scriptPick.value;
  const text = name && ScriptStore.get(name);
  if (text === null || text === '' || text === undefined) return;
  scriptTextEl.value = text;
  scriptNameEl.value = name;
  updateScriptStats();
  toast(t('script.loaded'));
});
$('#scriptDelete').addEventListener('click', () => {
  const name = scriptPick.value;
  if (!name || !confirm(`${t('script.delete')}: ${name}?`)) return;
  ScriptStore.remove(name);
  refreshScriptPick();
});
$('#scriptExport').addEventListener('click', () => {
  const name = scriptNameEl.value.trim() || 'roteiro';
  const data = JSON.stringify({ app: 'digita', version: 1, name, text: scriptTextEl.value }, null, 2);
  downloadBlob(new Blob([data], { type: 'application/json' }), `digita-${name.replace(/[^\w-]+/g, '_')}.json`);
});
$('#scriptImport').addEventListener('click', () => $('#scriptImportFile').click());
$('#scriptImportFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data?.text !== 'string') throw new Error('invalid');
    scriptTextEl.value = data.text;
    scriptNameEl.value = typeof data.name === 'string' ? data.name : '';
    updateScriptStats();
  } catch {
    toast(t('script.importFail'));
  }
});

// ---------- avatar e som próprio ----------

async function loadAvatar(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    renderer.setAvatar(c);
    redraw();
  } catch {
    toast(t('toast.avatarFail'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- painel ----------

const panel = buildPanel($('#panelBody'), {
  settings,
  audio,
  languages: LANGUAGES,
  testSound: (preset) => audio.test(preset),
  avatarFile: loadAvatar,
  avatarClear: () => {
    renderer.setAvatar(null);
    redraw();
  },
  soundFile: async (file) => {
    try {
      await audio.loadCustomFile(file);
      settings.set('sound.preset', 'custom');
      panel.render();
      toast(t('toast.soundLoaded'));
    } catch {
      toast(t('toast.soundFail'));
    }
  },
  soundClear: () => {
    audio.clearCustom();
    if (settings.get('sound.preset') === 'custom') settings.set('sound.preset', 'thocky');
    panel.render();
  },
  recordInfo: () => {
    const f = pickFormat(recordSetup());
    return f ? t('record.willUse', { fmt: `<b>${f.label}</b>` }) : recordSetup().transparent ? t('toast.transparentFallback') : t('record.unsupported');
  },
  record: () => startRecording(),
  reset: () => {
    settings.reset();
    toast(t('toast.reset'));
  },
  setLang: (lang) => settings.set('lang', lang),
});

function applyLanguage() {
  setLang(settings.get('lang'));
  applyI18n();
  syncPlayUI();
  $('#btnClean').title = t('top.clean');
  panel.render();
}

settings.onChange((path) => {
  audio.configure(settings.get('sound'));
  renderer.setConfig(settings.data);
  if (path === '*') {
    applyLanguage();
    requestRebuild();
    layoutStage();
    return;
  }
  if (path === 'lang') return applyLanguage();
  if (path.startsWith('timing') || path === 'sound.timingVar') requestRebuild();
  if (path === 'record.format' || path === 'background.type') layoutStage();
  panel.refresh();
  redraw();
});

function setPanel(open) {
  body.classList.toggle('panel-open', open);
  $('#btnSettings').setAttribute('aria-expanded', String(open));
}

// ---------- eventos globais ----------

$('#btnScript').addEventListener('click', openScript);
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnLive').addEventListener('click', () => setLive(!state.live));
$('#btnRestart').addEventListener('click', () => (state.live ? live.reset() : restart()));
$('#btnClean').addEventListener('click', () => setClean(true));
$('#btnRecord').addEventListener('click', () => (state.recording ? finishRecording() : startRecording()));
$('#btnSettings').addEventListener('click', () => setPanel(!body.classList.contains('panel-open')));
$('#panelClose').addEventListener('click', () => setPanel(false));
$('#panelBackdrop').addEventListener('click', () => setPanel(false));
$('#btnHelp').addEventListener('click', () => $('#dlgHowto').showModal());
$('#cbPlay').addEventListener('click', togglePlay);
$('#cbRestart').addEventListener('click', () => (state.live ? live.reset() : restart()));
$('#cbExit').addEventListener('click', () => setClean(false));

for (const dlg of document.querySelectorAll('dialog')) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg && dlg.id === 'dlgHowto') dlg.close();
  });
  for (const b of dlg.querySelectorAll('[data-close]')) b.addEventListener('click', () => dlg.close());
}
$('#dlgHowto').addEventListener('close', () => Onboarding.markSeen());

const stageWrap = $('#stageWrap');
stageWrap.addEventListener('pointermove', showBar);
stageWrap.addEventListener('pointerdown', (e) => {
  showBar();
  if (state.live && !e.target.closest('button')) setTimeout(() => liveInput.focus(), 0);
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && state.clean && !state.recording) setClean(false, { fullscreen: false });
});

new ResizeObserver(() => layoutStage()).observe(stageWrap);
window.addEventListener('resize', layoutStage);

const TYPING_INPUTS = new Set(['text', 'number', 'search', 'email', 'url', 'password']);
const isTyping = (el) => el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && TYPING_INPUTS.has(el.type));
// o Espaço num botão com foco só "clica" no keyup: impedimos também aí
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !isTyping(e.target) && !document.querySelector('dialog[open]')) e.preventDefault();
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = isTyping(e.target);
  const modalOpen = document.querySelector('dialog[open]');

  if (e.key === 'Escape') {
    if (modalOpen) return; // o <dialog> fecha-se sozinho
    if (state.recording) {
      if (state.rec.live) finishRecording();
      else cancelRecording();
    } else if (counting) {
      cancelCountdown();
      redraw();
    } else if (state.clean) setClean(false);
    else if (state.live) setLive(false);
    else if (body.classList.contains('panel-open') && innerWidth <= 860) setPanel(false);
    return;
  }
  if (typing || modalOpen || e.repeat) return;

  const key = e.key.toLowerCase();
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.recording) return;
    togglePlay();
  } else if (key === 'r') {
    e.preventDefault();
    if (state.recording) finishRecording();
    else if (state.clean) restart();
    else startRecording();
  } else if (key === 'enter' && state.clean && !state.recording) {
    e.preventDefault();
    restart();
  } else if (key === 'f' && !state.recording) {
    setClean(!state.clean);
  } else if (key === 'l' && !state.recording && !state.clean) {
    e.preventDefault(); // senão o "l" seria escrito no balão
    setLive(!state.live);
  }
});

// ---------- arranque ----------

audio.configure(settings.get('sound'));
renderer.setConfig(settings.data);
applyI18n();
setPanel(window.innerWidth > 860);
panel.render();
syncPlayUI();
rebuild();
layoutStage();

if (!Onboarding.seen()) $('#dlgHowto').showModal();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (new URLSearchParams(location.search).has('debug')) {
  window.__digita = { live, settings, player, renderer, audio, state, draw: (tm) => renderer.draw(timeline, tm), get timeline() { return timeline; } };
}
