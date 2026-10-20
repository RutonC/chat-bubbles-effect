// Gravação do canvas + áudio com MediaRecorder. Tudo fica em memória (Blob).

export const FORMATS = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
};

const MP4 = {
  // Com áudio só aceitamos AAC: o "video/mp4" genérico pode levar Opus dentro de MP4,
  // que muitos leitores/editores (Windows Filmes e TV, QuickTime...) reproduzem sem som.
  audio: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=h264,aac'],
  video: ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4;codecs=h264', 'video/mp4'],
};
const WEBM = {
  audio: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  video: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
};

function supported(list) {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

function describe(mime) {
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  let label;
  if (ext === 'mp4') label = 'MP4 (H.264)';
  else if (mime.includes('vp9')) label = 'WebM (VP9)';
  else if (mime.includes('vp8')) label = 'WebM (VP8)';
  else label = 'WebM';
  return { mime, ext, label };
}

/** Escolhe o formato segundo a preferência (webm por defeito; mp4 só se suportado). null = sem suporte. */
export function pickFormat({ withAudio, transparent, prefer = 'webm' }) {
  const key = withAudio ? 'audio' : 'video';
  if (transparent) {
    const m = supported(['video/webm;codecs=vp9' + (withAudio ? ',opus' : ''), 'video/webm;codecs=vp9']);
    return m ? describe(m) : null;
  }
  const order = prefer === 'mp4' ? [MP4, WEBM] : [WEBM, MP4];
  const mime = supported(order[0][key]) || supported(order[1][key]);
  return mime ? describe(mime) : null;
}

export function fileName(ext, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `digita-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.${ext}`;
}

export class VideoRecorder {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.audio = audio;
    this.rec = null;
    this.chunks = [];
    this.stream = null;
    this.audioPeak = 0;
    this.actualMime = '';
    this._meter = 0;
  }

  get active() {
    return !!this.rec && this.rec.state !== 'inactive';
  }

  start({ fps, withAudio, format }) {
    const stream = this.canvas.captureStream(fps);
    if (withAudio && this.audio.streamDest) {
      const track = this.audio.streamDest.stream.getAudioTracks()[0];
      if (track) stream.addTrack(track);
    }
    this.stream = stream;
    this.chunks = [];
    const pixels = this.canvas.width * this.canvas.height;
    const bps = Math.min(20e6, Math.max(4e6, Math.round(pixels * fps * 0.1)));
    const rec = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: bps, audioBitsPerSecond: 128000 });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.mime = format.mime;
    this.actualMime = rec.mimeType || format.mime;
    this.rec = rec;
    // mede o nível real do áudio enquanto grava, para avisar se saiu em silêncio
    this.audioPeak = 0;
    clearInterval(this._meter);
    if (withAudio) this._meter = setInterval(() => (this.audioPeak = Math.max(this.audioPeak, this.audio.peak())), 40);
    rec.start(500);
  }

  /** Termina e devolve o Blob. */
  stop() {
    return new Promise((resolve, reject) => {
      const rec = this.rec;
      if (!rec) return reject(new Error('not-recording'));
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] });
        this._cleanup();
        resolve(blob);
      };
      rec.onerror = (e) => reject(e.error || new Error('recorder-error'));
      if (rec.state !== 'inactive') rec.stop();
      else rec.onstop();
    });
  }

  cancel() {
    const rec = this.rec;
    if (rec) {
      rec.onstop = null;
      rec.ondataavailable = null;
      if (rec.state !== 'inactive') rec.stop();
    }
    this._cleanup();
  }

  _cleanup() {
    clearInterval(this._meter);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.chunks = [];
  }
}
