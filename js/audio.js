// 把任意视频/音频文件解成 16kHz 单声道 Float32Array。
// 不依赖 ffmpeg：浏览器的 decodeAudioData 能解 mp4(AAC)、mov、webm、m4a、mp3、wav。
import { t } from './i18n.js';

export const SR = 16000;

export async function decodeToMono16k(file, onProgress = () => {}) {
  onProgress(t('progress.read'));
  const buf = await file.arrayBuffer();

  onProgress(t('progress.decode'));
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ac = new Ctx();
  let decoded;
  try {
    decoded = await ac.decodeAudioData(buf);
  } finally {
    if (ac.close) ac.close();
  }

  const duration = decoded.duration;

  // 合并声道
  const ch = decoded.numberOfChannels;
  let mono;
  if (ch === 1) {
    mono = decoded.getChannelData(0);
  } else {
    mono = new Float32Array(decoded.length);
    for (let c = 0; c < ch; c++) {
      const d = decoded.getChannelData(c);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / ch;
    }
  }

  onProgress(t('progress.resample'));
  const samples = await resample(mono, decoded.sampleRate, SR);
  return { samples, duration, srcRate: decoded.sampleRate, srcChannels: ch };
}

function resample(input, from, to) {
  if (from === to) return Promise.resolve(input);
  const len = Math.max(1, Math.ceil(input.length * to / from));
  const off = new OfflineAudioContext(1, len, to);
  const buf = off.createBuffer(1, input.length, from);
  buf.copyToChannel(input, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return off.startRendering().then(r => r.getChannelData(0));
}

// 按固定长度切块（秒）。最后一块太短就和前面合并，避免碎片。
export function chunkAudio(samples, seconds = 30) {
  const size = Math.round(seconds * SR);
  const chunks = [];
  for (let start = 0; start < samples.length; start += size) {
    const end = Math.min(samples.length, start + size);
    chunks.push({ start, end, offset: start / SR, samples: samples.subarray(start, end) });
  }
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    if (last.samples.length < size * 0.5) {
      const prev = chunks[chunks.length - 2];
      prev.end = last.end;
      prev.samples = samples.subarray(prev.start, last.end);
      chunks.pop();
    }
  }
  return chunks;
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
