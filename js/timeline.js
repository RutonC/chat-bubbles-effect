// Linha do tempo determinística: dado o roteiro e os tempos, calcula quando cada
// balão entra, quando cada letra aparece e a duração total. O renderer e o
// player apenas "consultam" esta estrutura em função do tempo t (em segundos),
// o que torna pausar/reiniciar/gravar triviais e exatos.

export const SPEED_MULT = { slow: 0.55, normal: 1, fast: 2.2 };

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** Divide em "letras" visíveis (emojis compostos contam como uma só). */
export function splitGraphemes(str) {
  if (segmenter) return Array.from(segmenter.segment(str), (s) => s.segment);
  return Array.from(str);
}

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * @param items   saída de parseScript
 * @param timing  { mode, cps, showTyping, typingDuration, pauseBetween,
 *                  startDelay, endWait, blankPause, jitter }
 */
export function buildTimeline(items, timing) {
  const instant = timing.mode === 'instant';
  const jitter = clamp01(timing.jitter ?? 0);
  const msgs = [];
  let t = Math.max(0, timing.startDelay);
  let first = true;

  for (const item of items) {
    if (item.type === 'pause') {
      t += item.blank ? timing.blankPause : item.seconds;
      continue;
    }
    if (!first) t += timing.pauseBetween;
    first = false;

    const mult = SPEED_MULT[item.speed] ?? 1;
    const enterT = t;
    if (timing.showTyping) t += timing.typingDuration / mult;
    const textStart = t;

    const chars = splitGraphemes(item.text);
    const rng = mulberry32(0x9e3779b1 + msgs.length * 7919);
    const base = 1 / Math.max(1, timing.cps * mult);
    const charTimes = new Array(chars.length);
    let textEnd;

    if (instant) {
      charTimes.fill(textStart);
      textEnd = textStart + 0.25;
    } else {
      let ct = textStart;
      for (let k = 0; k < chars.length; k++) {
        const f = 1 + jitter * (rng() * 2 - 1) * 0.9;
        let dt = base * f;
        const prev = chars[k - 1];
        if (prev === ',' || prev === ';' || prev === ':') dt += base * 2.5;
        else if (prev === '.' || prev === '!' || prev === '?' || prev === '…') dt += base * 5;
        else if (prev === '\n') dt += base * 3;
        ct += dt;
        charTimes[k] = ct;
      }
      textEnd = (chars.length ? ct : textStart) + 0.2;
    }

    msgs.push({ index: msgs.length, side: item.side, speed: item.speed, instant, chars, enterT, textStart, charTimes, textEnd });
    t = textEnd;
  }

  const lastTextEnd = msgs.length ? msgs[msgs.length - 1].textEnd : 0;
  return { msgs, total: msgs.length ? t + timing.endWait : 0, lastTextEnd, previewT: lastTextEnd + 2 };
}

/** Quantas letras da mensagem já estão visíveis no instante t. */
export function revealCount(msg, t) {
  const ct = msg.charTimes;
  let lo = 0;
  let hi = ct.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ct[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
