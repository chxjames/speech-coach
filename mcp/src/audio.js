// 用捆绑的 ffmpeg 把任意视频/音频解成 16k 单声道 Float32Array。
// 浏览器版靠 AudioContext.decodeAudioData；Node 里没有它，所以走 ffmpeg 管道。
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export const SR = 16000;

export async function decodeToMono16k(file) {
  const args = [
    '-v', 'error',
    '-i', file,
    '-vn',
    '-ac', '1',
    '-ar', String(SR),
    '-f', 's16le',
    '-',
  ];
  const chunks = [];
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = '';
    p.stdout.on('data', d => chunks.push(d));
    p.stderr.on('data', d => { err += d.toString().slice(0, 4000); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`)));
  });
  const buf = Buffer.concat(chunks);
  const n = Math.floor(buf.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
  return { samples: out, duration: n / SR };
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
