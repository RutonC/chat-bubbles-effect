// Converte o texto do roteiro numa lista de itens ({type:'msg'} | {type:'pause'}).
//
// Sintaxe (uma linha = uma mensagem):
//   linha vazia          pausa extra
//   [pausa 2s]           pausa de 2 segundos (também: 1.5s, 500ms, [pause 2s])
//   [rapido] / [lento]   velocidade da PRÓXIMA mensagem ([normal] repõe)
//   > texto              mensagem do lado direito (resposta)
//   \> texto             começa com um ">" literal
//   \n dentro do texto   quebra de linha dentro do mesmo balão

const SPEED_TAGS = {
  rapido: 'fast', 'rápido': 'fast', fast: 'fast',
  lento: 'slow', slow: 'slow',
  normal: 'normal',
};

const PAUSE_RE = /^(?:pausa|pause|wait|espera)\s+(\d+(?:[.,]\d+)?)\s*(ms|s|seg)?$/i;

function toSeconds(num, unit) {
  const v = parseFloat(String(num).replace(',', '.'));
  return (unit || 's').toLowerCase() === 'ms' ? v / 1000 : v;
}

export function parseScript(text) {
  const items = [];
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

  let speed = 'normal';

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) {
      items.push({ type: 'pause', blank: true });
      continue;
    }

    let side = 'left';
    if (line.startsWith('\\')) {
      line = line.slice(1); // escape: o resto é texto literal
    } else {
      for (;;) {
        if (line.startsWith('>')) {
          side = 'right';
          line = line.slice(1).trimStart();
          continue;
        }
        const m = /^\[([^\]]*)\]\s*/.exec(line);
        if (!m) break;
        const tag = m[1].trim().toLowerCase();
        const pause = PAUSE_RE.exec(tag);
        if (pause) {
          items.push({ type: 'pause', seconds: toSeconds(pause[1], pause[2]) });
        } else if (tag in SPEED_TAGS) {
          speed = SPEED_TAGS[tag];
        } else {
          break; // etiqueta desconhecida: fica como texto
        }
        line = line.slice(m[0].length);
      }
    }

    if (!line) continue; // linha só com diretivas
    items.push({ type: 'msg', side, speed, text: line.replace(/\\n/g, '\n') });
    speed = 'normal';
  }

  return items;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
