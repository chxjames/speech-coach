// 画面分析：用 <video> + <canvas> 抽样若干帧，算亮度、曝光、动作幅度。
// 没有 ffmpeg，也不需要上传视频。

export async function analyzeVideo(file, { samples = 24 } = {}) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url;
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';

  await new Promise((res, rej) => {
    v.onloadedmetadata = res;
    v.onerror = () => rej(new Error('这个视频浏览器读不了'));
  });

  const duration = v.duration || 0;
  const W = 160, H = 90;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const frames = [];
  let prev = null;

  for (let i = 0; i < samples; i++) {
    const t = duration * (i + 0.5) / samples;
    await seek(v, t);
    ctx.drawImage(v, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;

    let sum = 0;
    let motion = 0;
    const gray = new Float32Array(W * H);
    for (let p = 0, j = 0; p < px.length; p += 4, j++) {
      const g = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
      gray[j] = g;
      sum += g;
    }
    if (prev) {
      let d = 0;
      for (let j = 0; j < gray.length; j++) d += Math.abs(gray[j] - prev[j]);
      motion = d / gray.length;
    }
    // 只统计中间 60% 区域，避免天花板/墙吃满画面
    let centerSum = 0, centerN = 0;
    for (let y = H * 0.2; y < H * 0.8; y++) {
      for (let x = W * 0.2; x < W * 0.8; x++) { centerSum += gray[(y | 0) * W + (x | 0)]; centerN++; }
    }

    frames.push({ t, luma: sum / (W * H), centerLuma: centerSum / centerN, motion });
    prev = gray;
  }

  URL.revokeObjectURL(url);
  v.remove();

  const lumas = frames.map(f => f.luma).sort((a, b) => a - b);
  const motions = frames.map(f => f.motion);
  return {
    width: v.videoWidth || 0,
    height: v.videoHeight || 0,
    duration,
    lumaMedian: lumas[Math.floor(lumas.length / 2)] ?? null,
    lumaMin: lumas[0] ?? null,
    lumaMax: lumas[lumas.length - 1] ?? null,
    motionAvg: motions.reduce((a, b) => a + b, 0) / (motions.length || 1),
    motionMax: motions.length ? Math.max(...motions) : 0,
    bitrateKbps: duration > 0 ? (file.size * 8 / duration) / 1000 : null,
  };
}

function seek(v, t) {
  return new Promise((res, rej) => {
    const onSeeked = () => { v.removeEventListener('seeked', onSeeked); res(); };
    v.addEventListener('seeked', onSeeked);
    v.currentTime = Math.min(t, Math.max(0, (v.duration || 1) - 0.05));
    setTimeout(() => { v.removeEventListener('seeked', onSeeked); rej(new Error('seek 超时')); }, 8000);
  });
}
