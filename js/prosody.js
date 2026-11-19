// 韵律分析：在浏览器里用原始的 16k 波形算音高、停顿、语速、句尾升降。
// 算法跟 Python 版 measure.py 保持一致，方便两边对分数。

import { SR } from './audio.js';

const FRAME = 640;      // 40ms
const HOP = 320;        // 20ms
const F0_MIN = 60, F0_MAX = 400;

const FILLERS = /\b(um+|uh+|erm|ah+|hmm|like|you know|sort of|kind of|i mean|actually|basically|really|pretty|just)\b/gi;

export function analyzeProsody(samples, words) {
  const frames = pitchTrack(samples);

  // 1) 按词间空隙切句
  const segs = segmentByGaps(words, 0.45, 15);

  // 2) 逐句算
  const out = [];
  for (const s of segs) {
    const fr = frames.filter(f => f.t >= s.start && f.t <= s.end);
    const voiced = fr.filter(f => f.voiced);
    const pitches = voiced.map(f => f.f0).sort((a, b) => a - b);
    const semis = voiced.map(f => f.st);

    const median = pitches.length ? pitches[Math.floor(pitches.length / 2)] : null;
    const p5 = semis.length ? quantile(semis, 0.05) : null;
    const p95 = semis.length ? quantile(semis, 0.95) : null;

    const voicedSec = voiced.length * (HOP / SR);
    const dur = Math.max(0.01, s.end - s.start);
    const text = s.words.map(w => w.text).join(' ').replace(/\s+([,.!?;:])/g, '$1');

    out.push({
      start: s.start, end: s.end, dur, text,
      words: s.words.length,
      voicedSec,
      medianPitch: median,
      rangeSt: (p5 != null && p95 != null) ? p95 - p5 : null,
      finalSlope: finalSlope(semis, voiced, s.end),
      db: energyDb(samples, s.start, s.end),
    });
  }

  const pauses = [];
  for (let i = 1; i < out.length; i++) {
    const g = out[i].start - out[i - 1].end;
    if (g >= 0.3) pauses.push({ at: out[i - 1].end, dur: g });
  }

  const speechSec = out.reduce((a, s) => a + Math.max(0, s.dur - 0.05), 0);
  const wordsTotal = out.reduce((a, s) => a + s.words, 0);
  const voicedSec = out.reduce((a, s) => a + s.voicedSec, 0);
  const allText = out.map(s => s.text).join(' ');
  const fillers = (allText.match(FILLERS) || []);

  const medians = out.map(s => s.medianPitch).filter(x => x);
  const medOfMedians = medians.length ? median(medians) : null;
  const sd = out.length > 1 && medOfMedians
    ? Math.sqrt(out.reduce((a, s) => a + Math.pow(s.medianPitch - medOfMedians, 2), 0) / out.length)
    : 0;
  const sdSt = medOfMedians ? 12 * Math.log2((medOfMedians + sd) / medOfMedians) : 0;

  const finals = out.map(s => s.finalSlope).filter(x => x != null);
  const counts = { falling: 0, flat: 0, rising: 0 };
  for (const f of finals) {
    if (f < -0.5) counts.falling++;
    else if (f > 0.5) counts.rising++;
    else counts.flat++;
  }

  return {
    segments: out,
    summary: {
      segments: out.length,
      words: wordsTotal,
      speechSec,
      voicedSec,
      pauses: pauses.length,
      pauseAvg: pauses.length ? pauses.reduce((a, p) => a + p.dur, 0) / pauses.length : 0,
      pauseMax: pauses.length ? Math.max(...pauses.map(p => p.dur)) : 0,
      wpm: speechSec > 0 ? wordsTotal / (speechSec / 60) : 0,
      articWpm: voicedSec > 0 ? wordsTotal / (voicedSec / 60) : 0,
      medianPitch: medOfMedians,
      rangeSt: out.map(s => s.rangeSt).filter(x => x != null).sort((a, b) => a - b).slice(-1)[0] ?? null,
      segSdSt: sdSt,
      finals: counts,
      fillers: fillers.length,
      fillerRate: wordsTotal ? fillers.length / wordsTotal * 100 : 0,
      longest: out.length ? Math.max(...out.map(s => s.dur)) : 0,
    },
  };
}

// 自相关基频跟踪。返回每帧 {t, f0, st, voiced}
function pitchTrack(samples) {
  const frames = [];
  const minLag = Math.floor(SR / F0_MAX);
  const maxLag = Math.floor(SR / F0_MIN);

  // 先算一遍能量，用于 voiced 判断的阈值
  const rmsList = [];
  for (let i = 0; i + FRAME < samples.length; i += HOP) {
    rmsList.push(rms(samples, i, FRAME));
  }
  const loud = [...rmsList].sort((a, b) => a - b);
  const p90 = loud[Math.floor(loud.length * 0.9)] || 0;
  // 0.05 × p90 是和 Python 版对齐后调出来的：太高会漏掉轻声字，发音速率就虚高
  const energyFloor = Math.max(p90 * 0.05, 0.0015);

  let idx = 0;
  for (let i = 0; i + FRAME < samples.length; i += HOP, idx++) {
    const e = rmsList[idx];
    const t = (i + FRAME / 2) / SR;
    if (e < energyFloor) { frames.push({ t, f0: null, st: null, voiced: false }); continue; }

    const { lag, conf } = bestLag(samples, i, minLag, maxLag);
    if (lag && conf > 0.3) {
      const f0 = SR / lag;
      frames.push({ t, f0, st: 12 * Math.log2(f0 / 100), voiced: true, conf, e });
    } else {
      frames.push({ t, f0: null, st: null, voiced: false, e });
    }
  }
  return frames;
}

function bestLag(x, start, minLag, maxLag) {
  // 归一化自相关；取"最长且够接近峰值"的 lag，避免倍频误差
  const n = FRAME;
  let peak = 0;
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < n - lag; i++) {
      const a = x[start + i], b = x[start + i + lag];
      s += a * b; e1 += a * a; e2 += b * b;
    }
    const c = s / (Math.sqrt(e1 * e2) + 1e-9);
    corr[lag] = c;
    if (c > peak) peak = c;
  }
  if (peak <= 0) return { lag: null, conf: 0 };
  for (let lag = maxLag; lag >= minLag; lag--) {
    if (corr[lag] >= peak * 0.88) return { lag, conf: corr[lag] };
  }
  return { lag: null, conf: peak };
}

// 句尾 0.6 秒的半音/秒斜率（用 voiced 帧做线性回归）
function finalSlope(semis, voiced, end) {
  const tail = voiced.filter(f => f.t >= end - 0.6);
  if (tail.length < 3) return null;
  const xs = tail.map(f => f.t), ys = tail.map(f => f.st);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den > 0 ? num / den : null;
}

function segmentByGaps(words, gapSec, maxLen) {
  const segs = [];
  let cur = [];
  for (const w of words) {
    if (cur.length && (w.start - cur[cur.length - 1].end > gapSec || w.start - cur[0].start > maxLen)) {
      segs.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) segs.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
  return segs;
}

function energyDb(samples, start, end) {
  const a = Math.max(0, Math.floor(start * SR));
  const b = Math.min(samples.length, Math.floor(end * SR));
  let sum = 0, n = 0;
  for (let i = a; i < b; i += 4) { sum += samples[i] * samples[i]; n++; }
  if (!n) return -100;
  const r = Math.sqrt(sum / n);
  return r > 0 ? 20 * Math.log10(r) : -100;
}

function rms(x, start, n) {
  let s = 0;
  for (let i = 0; i < n; i++) { const v = x[start + i] || 0; s += v * v; }
  return Math.sqrt(s / n);
}

const quantile = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null;
const median = (arr) => quantile([...arr].sort((a, b) => a - b), 0.5);
