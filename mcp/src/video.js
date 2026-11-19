// 画面分析：跟浏览器版同一套算法（160×90 灰度、抽 24 帧、算亮度与帧间差），
// 只是把 <video>+<canvas> 换成 ffmpeg 管道。
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import ffmpegPath from 'ffmpeg-static';

const W = 160, H = 90;

export async function analyzeVideo(file, { samples = 24 } = {}) {
  const meta = await probe(file);
  const duration = meta.duration;
  if (!duration) throw new Error('读不出这个视频的时长');

  const fps = samples / duration;
  const args = [
    '-v', 'error',
    '-i', file,
    '-vf', `fps=${fps.toFixed(6)},scale=${W}:${H}:flags=fast_bilinear,format=gray`,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
  ];
  const frames = [];
  let prev = null;
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let acc = Buffer.alloc(0);
    let err = '';
    p.stdout.on('data', d => {
      acc = Buffer.concat([acc, d]);
      const n = W * H;
      while (acc.length >= n) {
        const gray = new Float32Array(n);
        for (let j = 0; j < n; j++) gray[j] = acc[j];
        let sum = 0;
        for (let j = 0; j < n; j++) sum += gray[j];
        let centerSum = 0, centerN = 0;
        for (let y = Math.floor(H * 0.2); y < H * 0.8; y++) {
          for (let x = Math.floor(W * 0.2); x < W * 0.8; x++) { centerSum += gray[y * W + x]; centerN++; }
        }
        let motion = 0;
        if (prev) {
          let d = 0;
          for (let j = 0; j < n; j++) d += Math.abs(gray[j] - prev[j]);
          motion = d / n;
        }
        frames.push({ luma: sum / n, centerLuma: centerSum / centerN, motion });
        prev = gray;
        acc = acc.subarray(n);
      }
    });
    p.stderr.on('data', d => { err += d.toString().slice(0, 2000); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`)));
  });

  if (!frames.length) throw new Error('这个视频读不出画面（可能是纯音频文件）');
  const lumas = frames.map(f => f.luma).sort((a, b) => a - b);
  const motions = frames.map(f => f.motion);
  const size = statSync(file).size;
  return {
    width: meta.width,
    height: meta.height,
    duration,
    lumaMedian: lumas[Math.floor(lumas.length / 2)] ?? null,
    lumaMin: lumas[0] ?? null,
    lumaMax: lumas[lumas.length - 1] ?? null,
    motionAvg: motions.reduce((a, b) => a + b, 0) / (motions.length || 1),
    motionMax: motions.length ? Math.max(...motions) : 0,
    bitrateKbps: duration > 0 ? (size * 8 / duration) / 1000 : null,
  };
}

function probe(file) {
  const args = ['-hide_banner', '-i', file];
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', () => {
      const dm = err.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      const duration = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]) : 0;
      const vm = err.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
      resolve({
        duration,
        width: vm ? +vm[1] : 0,
        height: vm ? +vm[2] : 0,
      });
    });
  });
}
