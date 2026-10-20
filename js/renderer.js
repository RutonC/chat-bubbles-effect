// Renderer do palco. draw(timeline, t) desenha o estado exato no instante t:
// não guarda animação própria, por isso é igual no ecrã e na gravação.
import { revealCount } from './timeline.js';

const EMOJI_FONTS = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export const FONTS = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  rounded: '"Nunito", "Varela Round", "Trebuchet MS", Verdana',
  serif: 'Georgia, "Times New Roman"',
  mono: '"SF Mono", Menlo, Consolas, "Courier New"',
  hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS"',
};

// radiusRel: relativo ao tamanho da letra; tail: curl | corner | none
export const THEMES = {
  'ios-light': { leftBg: '#E9E9EB', leftText: '#000000', rightBg: '#0A84FF', rightText: '#FFFFFF', font: 'system', radiusRel: 0.62, tail: 'curl', shadow: false },
  'ios-dark': { leftBg: '#2B2B2E', leftText: '#FFFFFF', rightBg: '#0A84FF', rightText: '#FFFFFF', font: 'system', radiusRel: 0.62, tail: 'curl', shadow: false },
  whatsapp: { leftBg: '#FFFFFF', leftText: '#111B21', rightBg: '#D9FDD3', rightText: '#111B21', font: 'system', radiusRel: 0.34, tail: 'corner', shadow: true },
  minimal: { leftBg: '#FFFFFF', leftText: '#1D1D1F', rightBg: '#1D1D1F', rightText: '#FFFFFF', font: 'system', radiusRel: 0.55, tail: 'none', shadow: false },
};

export const BACKGROUNDS = { green: '#00B140', blue: '#0047BB', black: '#000000' };

const ENTER_DUR = 0.42;
const EXIT_DUR = 0.4;
const LINE_DUR = 0.14;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutCubic = (p) => 1 - (1 - p) ** 3;
const easeOutBack = (p) => {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

/** Converte as definições no que o renderer precisa (tema resolvido, fundo, etc.). */
export function resolveConfig(s) {
  let theme;
  if (s.theme === 'custom') {
    const c = s.custom;
    theme = { leftBg: c.leftBg, leftText: c.leftText, rightBg: c.rightBg, rightText: c.rightText, font: c.font, radiusAbs: c.radius, tail: c.tail, shadow: c.shadow };
  } else {
    theme = THEMES[s.theme] || THEMES['ios-light'];
  }
  const bgType = s.background.type;
  const bg = bgType === 'transparent' ? null : bgType === 'custom' ? s.background.custom : BACKGROUNDS[bgType] || BACKGROUNDS.green;
  return { theme, layout: s.layout, avatar: s.avatar, bg };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.cfg = null;
    this.avatarImage = null;
    this.layouts = new WeakMap();
    this.bgOverride = undefined; // undefined = usar o das definições
  }

  setConfig(settings) {
    this.cfg = resolveConfig(settings);
    this.layouts = new WeakMap();
  }

  setAvatar(image) {
    this.avatarImage = image;
  }

  setSize(w, h) {
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.layouts = new WeakMap();
  }

  get width() {
    return this.canvas.width;
  }
  get height() {
    return this.canvas.height;
  }

  // ---------- layout de texto ----------

  layoutMessage(msg, maxW) {
    const ctx = this.ctx;
    const key = `${ctx.font}|${Math.round(maxW)}`;
    const cached = this.layouts.get(msg);
    if (cached && cached.key === key) return cached;

    const chars = msg.chars;
    const lines = [];
    const measure = (a, b) => ctx.measureText(chars.slice(a, b).join('')).width;
    const push = (start, end) => {
      const pw = [0];
      for (let k = 1; k <= end - start; k++) pw.push(measure(start, start + k));
      lines.push({ start, end, chars: chars.slice(start, end), pw, w: pw[pw.length - 1] });
    };

    let start = 0;
    let lastSpace = -1;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === '\n') {
        push(start, i);
        start = i + 1;
        lastSpace = -1;
        continue;
      }
      if (c === ' ') lastSpace = i;
      if (i > start && measure(start, i + 1) > maxW) {
        if (lastSpace > start) {
          push(start, lastSpace);
          start = lastSpace + 1;
        } else {
          push(start, i);
          start = i;
        }
        lastSpace = -1;
        i = start - 1;
      }
    }
    push(start, chars.length);

    const layout = { key, lines, fullW: Math.max(...lines.map((l) => l.w)) };
    this.layouts.set(msg, layout);
    return layout;
  }

  // ---------- desenho ----------

  draw(tl, t) {
    const { ctx, cfg } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!cfg) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    const bg = this.bgOverride === undefined ? cfg.bg : this.bgOverride;
    if (bg === null) ctx.clearRect(0, 0, W, H);
    else {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }
    if (!tl || t == null || t < 0 || !tl.msgs.length) return;

    const { theme, layout, avatar } = cfg;
    const u = Math.min(W, H) / 1080;
    const fs = layout.fontSize * u;
    const padX = fs * 0.55;
    const padY = fs * 0.42;
    const lineH = fs * 1.28;
    const radiusBase = theme.radiusAbs != null ? theme.radiusAbs * u : theme.radiusRel * fs;
    const fontStack = `${FONTS[theme.font] || FONTS.system}, ${EMOJI_FONTS}`;
    ctx.font = `${fs}px ${fontStack}`;
    ctx.textBaseline = 'middle';

    const avatarSize = avatar.size * u;
    const avatarCol = avatar.show ? avatarSize + 18 * u : 0;
    const marginX = layout.marginX * u;
    const maxBW = Math.max(fs * 3, Math.min(layout.maxWidth * u, W - marginX * 2 - avatarCol));
    const textMaxW = maxBW - padX * 2;
    const leftX = marginX + avatarCol;
    const rightEdge = layout.replyPlacement === 'edge' ? W - marginX : marginX + avatarCol + maxBW;
    const dotsW = fs * 2.2;
    const gapSame = fs * 0.14;
    const gapDiff = fs * 0.42;
    const nameFs = fs * 0.62;
    const nameH = avatar.showName && avatar.name ? nameFs + 10 * u : 0;

    const msgs = tl.msgs;
    let last = -1;
    while (last + 1 < msgs.length && msgs[last + 1].enterT <= t) last++;
    if (last < 0) return;

    const draws = [];
    let cursor = H - layout.marginY * u;

    for (let i = last; i >= 0; i--) {
      const m = msgs[i];
      let fade = 1;
      const evictor = msgs[i + layout.maxVisible];
      if (evictor && evictor.enterT <= t) {
        const q = (t - evictor.enterT) / EXIT_DUR;
        if (q >= 1) break; // este e todos os mais antigos já saíram
        fade = 1 - q;
      }

      const p = clamp01((t - m.enterT) / ENTER_DUR);
      const typing = t < m.textStart;
      const n = typing ? 0 : revealCount(m, t);
      const lay = this.layoutMessage(m, textMaxW);
      const g = clamp01((t - m.textStart) / 0.18);
      const isLeft = m.side === 'left';

      let widest = 0;
      let hLines = 1;
      const shown = []; // { line, cnt, alpha }
      if (!typing) {
        hLines = 0;
        for (let li = 0; li < lay.lines.length; li++) {
          const line = lay.lines[li];
          if (li > 0 && n <= line.start) break;
          const cnt = Math.min(line.end - line.start, Math.max(0, n - line.start));
          const appearT = m.charTimes[Math.min(line.start, m.charTimes.length - 1)] ?? m.textStart;
          const frac = li === 0 ? 1 : easeOutCubic(clamp01((t - appearT) / LINE_DUR));
          hLines += frac;
          widest = Math.max(widest, cnt === line.end - line.start ? line.w : line.pw[cnt]);
          shown.push({ line, cnt, alpha: frac });
        }
        if (hLines < 1) hLines = 1;
      }

      let w;
      if (typing) w = dotsW;
      else if (m.charTimes.length === 0) w = dotsW;
      else if (isLeft && !m.instant) w = Math.max(dotsW, widest + padX * 2);
      else w = dotsW + (Math.max(dotsW, lay.fullW + padX * 2) - dotsW) * easeOutCubic(g); // direita / instantâneo
      const h = hLines * lineH + padY * 2;

      const first = i === 0 || msgs[i - 1].side !== m.side;
      const tail = !(i < last && msgs[i + 1].side === m.side);
      const label = isLeft && first ? nameH : 0;

      const slot = easeOutCubic(p);
      const yOff = (1 - slot) * h * 0.5;
      draws.push({
        m, i, isLeft, w, h, tail, first,
        x: isLeft ? leftX : rightEdge - w,
        bottom: cursor,
        yOff: yOff - (1 - fade) * 14 * u,
        scale: 0.8 + 0.2 * easeOutBack(p),
        alpha: clamp01(p * 3) * fade,
        typing, g, shown, label, fade,
      });
      const gap = i > 0 ? (msgs[i - 1].side === m.side ? gapSame : gapDiff) : 0;
      cursor -= (h + label + gap) * slot;
    }

    const shadow = theme.shadow;
    for (let k = draws.length - 1; k >= 0; k--) {
      const d = draws[k];
      const bubbleBg = d.isLeft ? theme.leftBg : theme.rightBg;
      const fg = d.isLeft ? theme.leftText : theme.rightText;
      const r = Math.min(radiusBase, d.h / 2, d.w / 2);

      ctx.save();
      ctx.globalAlpha = d.alpha;
      const ax = d.isLeft ? d.x : d.x + d.w;
      ctx.translate(ax, d.bottom + d.yOff);
      ctx.scale(d.scale, d.scale);
      const lx = d.isLeft ? 0 : -d.w; // canto esquerdo local
      const top = -d.h;

      if (shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.28)';
        ctx.shadowBlur = 16 * u;
        ctx.shadowOffsetY = 4 * u;
      }
      ctx.fillStyle = bubbleBg;
      bubblePath(ctx, lx, top, d.w, d.h, r, d.isLeft, d.tail ? theme.tail : 'none');
      ctx.fill();
      ctx.shadowColor = 'transparent';

      ctx.fillStyle = fg;
      if (d.typing || (d.m.instant && d.g < 1)) {
        const dotsAlpha = d.typing ? 1 : 1 - d.g;
        if (dotsAlpha > 0) drawDots(ctx, lx + d.w / 2, top + d.h / 2, fs, t, dotsAlpha * d.alpha);
      }
      const textAlpha = d.typing ? 0 : d.m.instant ? d.g : 1;
      if (textAlpha > 0) {
        const tx = lx + padX;
        for (let li = 0; li < d.shown.length; li++) {
          const s = d.shown[li];
          if (s.cnt === 0) continue;
          ctx.globalAlpha = d.alpha * s.alpha * textAlpha;
          ctx.fillText(s.line.chars.slice(0, s.cnt).join(''), tx, top + padY + li * lineH + lineH / 2);
        }
      }

      if (d.label && avatar.name) {
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = avatar.nameColor;
        ctx.font = `600 ${nameFs}px ${fontStack}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(avatar.name, lx + padX * 0.6, top - 8 * u);
        ctx.font = `${fs}px ${fontStack}`;
        ctx.textBaseline = 'middle';
      }
      ctx.restore();
    }

    if (avatar.show) this.drawAvatars(draws, t, avatarSize, marginX, u);
  }

  drawAvatars(draws, t, size, x, u) {
    const { ctx, cfg } = this;
    for (const d of draws) {
      if (!d.isLeft || !d.tail) continue;
      let firstEnter = d.m.enterT;
      for (let j = d.i - 1; j >= 0; j--) {
        const prev = draws.find((o) => o.i === j);
        if (!prev || !prev.isLeft) break;
        firstEnter = prev.m.enterT;
      }
      const a = clamp01((t - firstEnter) / 0.25) * d.fade;
      if (a <= 0) continue;
      const cy = d.bottom - size / 2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x + size / 2, cy, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const img = this.avatarImage;
      if (img) {
        const iw = img.width;
        const ih = img.height;
        const s = Math.min(iw, ih);
        ctx.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, x, cy - size / 2, size, size);
      } else {
        ctx.fillStyle = '#8E8E93';
        ctx.fillRect(x, cy - size / 2, size, size);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `600 ${size * 0.46}px ${FONTS.system}, ${EMOJI_FONTS}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((cfg.avatar.name || '?').trim().charAt(0).toUpperCase() || '?', x + size / 2, cy + size * 0.03);
      }
      ctx.restore();
    }
    ctx.textAlign = 'left';
  }
}

function drawDots(ctx, cx, cy, fs, t, alpha) {
  const spacing = fs * 0.42;
  const r = fs * 0.12;
  for (let j = -1; j <= 1; j++) {
    const wave = 0.5 + 0.5 * Math.sin((t * 1.15 - (j + 1) * 0.17) * Math.PI * 2);
    ctx.globalAlpha = alpha * (0.3 + 0.55 * wave);
    ctx.beginPath();
    ctx.arc(cx + j * spacing, cy - wave * fs * 0.05, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Caminho do balão. Desenhado como "esquerdo" e espelhado para o lado direito. */
function bubblePath(ctx, x, y, w, h, r, isLeft, tail) {
  ctx.save();
  if (!isLeft) {
    ctx.translate(x + w, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  if (tail === 'curl') {
    const tw = r * 0.7;
    const th = r * 1.15;
    ctx.lineTo(x, y + h);
    ctx.bezierCurveTo(x - tw * 0.1, y + h, x - tw * 0.75, y + h, x - tw, y + h);
    ctx.bezierCurveTo(x - tw * 0.2, y + h - th * 0.05, x, y + h - th * 0.4, x, y + h - th);
  } else if (tail === 'corner') {
    const rb = Math.min(r, h / 2) * 0.12;
    ctx.lineTo(x + rb, y + h);
    ctx.arcTo(x, y + h, x, y + h - rb, rb);
  } else {
    ctx.arcTo(x, y + h, x, y + h - r, r);
  }
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.restore();
}
