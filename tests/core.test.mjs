import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseScript, formatDuration } from '../js/script-parser.js';
import { buildTimeline, revealCount, splitGraphemes } from '../js/timeline.js';
import { DICTIONARIES } from '../js/i18n.js';
import { DEFAULTS } from '../js/settings.js';

const timing = { mode: 'typewriter', cps: 10, showTyping: true, typingDuration: 1, pauseBetween: 1, startDelay: 1, endWait: 2, blankPause: 1.5, jitter: 0 };

test('parser: mensagens simples e resposta à direita', () => {
  const items = parseScript('Olá\n> Oi!\n');
  assert.deepEqual(items.map((i) => [i.type, i.side, i.text]), [['msg', 'left', 'Olá'], ['msg', 'right', 'Oi!']]);
});

test('parser: pausas, linha vazia e velocidade', () => {
  const items = parseScript('[pausa 2s]\nA\n\n[rapido]\nB\n[lento] C\nD\n[pausa 500ms]\nE');
  assert.equal(items[0].seconds, 2);
  assert.equal(items[2].blank, true);
  const msgs = items.filter((i) => i.type === 'msg');
  assert.deepEqual(msgs.map((m) => m.speed), ['normal', 'fast', 'slow', 'normal', 'normal']);
  assert.equal(items.find((i) => i.seconds === 0.5).type, 'pause');
});

test('parser: etiquetas desconhecidas, escape e \\n ficam como texto', () => {
  const items = parseScript('[sic] ok\n\\> literal\nlinha1\\nlinha2');
  assert.equal(items[0].text, '[sic] ok');
  assert.equal(items[1].text, '> literal');
  assert.equal(items[1].side, 'left');
  assert.equal(items[2].text, 'linha1\nlinha2');
});

test('parser: linhas finais vazias são ignoradas; CRLF suportado', () => {
  assert.equal(parseScript('A\r\nB\r\n\r\n\r\n').length, 2);
});

test('timeline: tempos coerentes', () => {
  const tl = buildTimeline(parseScript('abcde\nxy'), timing);
  const [a, b] = tl.msgs;
  assert.equal(a.enterT, 1);
  assert.equal(a.textStart, 2);
  assert.ok(Math.abs(a.charTimes[4] - 2.5) < 1e-9); // 5 letras a 10 cps
  assert.ok(Math.abs(b.enterT - (a.textEnd + 1)) < 1e-9);
  assert.ok(Math.abs(tl.total - (b.textEnd + 2)) < 1e-9);
  assert.equal(revealCount(a, 2.25), 2);
  assert.equal(revealCount(a, 100), 5);
});

test('timeline: [rapido] encurta e [lento] alonga', () => {
  const dur = (s) => { const m = buildTimeline(parseScript(s), timing).msgs[0]; return m.textEnd - m.enterT; };
  assert.ok(dur('[rapido]\nabcdefghij') < dur('abcdefghij'));
  assert.ok(dur('[lento]\nabcdefghij') > dur('abcdefghij'));
});

test('timeline: determinística com jitter e modo instantâneo', () => {
  const j = { ...timing, jitter: 0.5 };
  assert.deepEqual(buildTimeline(parseScript('Hello world'), j).msgs[0].charTimes, buildTimeline(parseScript('Hello world'), j).msgs[0].charTimes);
  const inst = buildTimeline(parseScript('Hello'), { ...timing, mode: 'instant' }).msgs[0];
  assert.equal(new Set(inst.charTimes).size, 1);
});

test('timeline: emojis compostos contam como uma letra; vazio dá total 0', () => {
  assert.equal(splitGraphemes('a👨‍👩‍👧b').length, 3);
  assert.equal(buildTimeline([], timing).total, 0);
});

test('formatDuration', () => {
  assert.equal(formatDuration(75), '1:15');
  assert.equal(formatDuration(0), '0:00');
});

test('i18n: todas as chaves usadas existem em pt e en', () => {
  const src = ['index.html', ...readdirSync(new URL('../js/', import.meta.url)).map((f) => 'js/' + f)]
    .map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
  const keys = new Set();
  for (const m of src.matchAll(/data-i18n(?:-html|-title|-placeholder)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of src.matchAll(/\bt\('([^']+)'/g)) keys.add(m[1]);
  for (const m of src.matchAll(/'((?:(?:top|toast|script|howto|rec|sec|bar|privacy)\.[\w-]+)|record\.(?:willUse|unsupported|start)|sound\.(?:test|note)|avatar\.note|bg\.transparentNote)'/g)) keys.add(m[1]);
  for (const lang of ['pt', 'en']) {
    const missing = [...keys].filter((k) => !(k in DICTIONARIES[lang]));
    assert.deepEqual(missing, [], `chaves em falta em ${lang}`);
  }
  assert.deepEqual(Object.keys(DICTIONARIES.pt).sort(), Object.keys(DICTIONARIES.en).sort());
});

test('i18n: rótulos de campos do painel existem', () => {
  const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
  const paths = [...ui.matchAll(/path: '([\w.]+)'/g)].map((m) => m[1]);
  assert.ok(paths.length > 20);
  for (const p of paths) {
    assert.ok(`f.${p}` in DICTIONARIES.pt, `f.${p}`);
    assert.ok(p.split('.').reduce((o, k) => o?.[k], DEFAULTS) !== undefined, `default ${p}`);
  }
});

import { LiveSession } from '../js/live.js';

test('live: escrever, resposta com ">", apagar e enviar', () => {
  const s = new LiveSession();
  s.type('H'); s.type('i');
  assert.deepEqual(s.timeline.msgs[0].chars, ['H', 'i']);
  assert.equal(s.timeline.msgs[0].charTimes.length, 2);
  assert.equal(s.send(), true);
  assert.equal(s.timeline.msgs[0].textEnd < Infinity, true);
  s.type('>'); s.type('o'); // resposta
  assert.equal(s.timeline.msgs[1].side, 'right');
  assert.deepEqual(s.timeline.msgs[1].chars, ['o']);
  s.backspace(); s.backspace(); // apaga o texto e depois cancela o balão vazio
  assert.equal(s.timeline.msgs.length, 1);
  assert.equal(s.send(), false);
});

test('live: versão muda a cada edição (invalida o layout em cache)', () => {
  const s = new LiveSession();
  s.type('a');
  const v = s.timeline.msgs[0].version;
  s.type('b');
  assert.ok(s.timeline.msgs[0].version > v);
});

test('live: ignora espaços no início da mensagem (ex.: "> texto")', () => {
  const s = new LiveSession();
  s.type('>'); s.type(' '); s.type('o'); s.type(' '); s.type('k');
  assert.deepEqual(s.timeline.msgs[0].chars, ['o', ' ', 'k']);
});
