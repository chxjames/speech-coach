// 韵律分析：在浏览器里用原始的 16k 波形算音高、停顿、语速、句尾升降。
// 算法跟 Python 版 measure.py 保持一致，方便两边对分数。

import { SR } from './audio.js';

const FRAME = 640;      // 40ms
const HOP = 320;        // 20ms
const F0_MIN = 60, F0_MAX = 400;

const FILLERS = /\b(um+|uh+|erm|ah+|hmm|like|you know|sort of|kind of|i mean|actually|basically|really|pretty|just)\b/gi;

export function analyzeProsody(samples, words) {
  const frames = pitchTrack(samples);

  // 丢掉超出音频长度的词：Whisper 在每块结尾偶尔会吐一个时间戳在音频之外的幻觉词，
  // 留着会把最后一个停顿拉成二十几秒。
  const totalSec = samples.length / SR;
  words = words
    .filter(w => w.start >= 0 && w.start < totalSec - 0.05)
    .map(w => ({ ...w, end: Math.min(w.end == null ? w.start : w.end, totalSec) }));

  // 静音阈值：这台机器录的音底噪很低（p10 ≈ 0.0004），人声大多在 0.01 以上。
  // 取 p10×3 与 p90×1.2% 的较大者——太高会把轻声字算成静音（语速虚高），
  // 太低会把换气声算成说话。
  const es = frames.map(f => f.e || 0).sort((a, b) => a - b);
  const p10e = es[Math.floor(es.length * 0.1)] || 0;
  const p90e = es[Math.floor(es.length * 0.9)] || 0;
  const silThr = Math.max(p10e * 3, p90e * 0.012, 0.0008);
  const silenceRatio = (a, b) => {
    if (b <= a) return 1;
    let n = 0, silent = 0;
    for (const f of frames) {
      if (f.t < a || f.t > b) continue;
      n++;
      if ((f.e || 0) < silThr) silent++;
    }
    return n ? silent / n : 1;
  };

  // 1) 按词间空隙切句，但只在空隙真的安静时才断开
  const segs = segmentByGaps(words, 0.45, 15, silenceRatio);

  // 2) 逐句算
  const out = [];
  for (const s of segs) {
    const fr = frames.filter(f => f.t >= s.start && f.t <= s.end);
    const voiced = fr.filter(f => f.voiced);
    const pitches = voiced.map(f => f.f0).sort((a, b) => a - b);
    const semis = voiced.map(f => f.st).filter(x => x != null).sort((x, y) => x - y);   // quantile 要求有序；null 是判为八度错误的帧

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

  const allSemis = frames.filter(f => f.voiced && f.st != null).map(f => f.st).sort((a, b) => a - b);

  const pauses = [];
  for (let i = 1; i < out.length; i++) {
    const g = out[i].start - out[i - 1].end;
    if (g >= 0.3) pauses.push({ at: out[i - 1].end, dur: g });
  }

  // 说话时长按能量算：词级时间戳会漏字，能量不会。
  const spanStart = out.length ? out[0].start : 0;
  const spanEnd = out.length ? out[out.length - 1].end : 0;
  let speechFrames = 0;
  for (const f of frames) {
    if (f.t >= spanStart && f.t <= spanEnd && (f.e || 0) >= silThr) speechFrames++;
  }
  const speechSec = speechFrames * (HOP / SR);
  const spanSec = out.length > 1 ? out[out.length - 1].end - out[0].start : speechSec;
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
      spanSec,
      voicedSec,
      pauses: pauses.length,
      pauseAvg: pauses.length ? pauses.reduce((a, p) => a + p.dur, 0) / pauses.length : 0,
      pauseMax: pauses.length ? Math.max(...pauses.map(p => p.dur)) : 0,
      // 两个速率的定义分清楚，才能和文献/获奖者数据比：
      //   净语速（wpm）= 总词数 ÷ 首词到末词的时长（含停顿）——HBR 那个 150 wpm 说的就是这个
      //   发音速率（articWpm）= 总词数 ÷ 真正出声的时长（不含停顿）
      // 早期版本把净语速也算成"不含停顿"，数字会偏高 20%，是错的。
      wpm: spanSec > 1 ? wordsTotal / (spanSec / 60) : 0,
      articWpm: speechSec > 0 ? wordsTotal / (speechSec / 60) : 0,
      medianPitch: medOfMedians,
      // 音域用全片 5%–95% 分位，比"单句最宽"稳，也更接近文献里的做法
      rangeSt: allSemis.length > 4
        ? (quantile(allSemis, 0.95) - quantile(allSemis, 0.05))
        : null,
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
    if (e < energyFloor) { frames.push({ t, f0: null, st: null, voiced: false, e }); continue; }

    const { lag, conf } = bestLag(samples, i, minLag, maxLag);
    if (lag && conf >= 0.45) {
      const f0 = SR / lag;
      frames.push({ t, f0, st: 12 * Math.log2(f0 / 100), voiced: true, conf, e });
    } else {
      frames.push({ t, f0: null, st: null, voiced: false, e });
    }
  }
  // 3 帧中值平滑，压掉单帧倍频错误（和 Python 版 analyze.js 对齐）
  const voiced = frames.filter(f => f.voiced);
  for (let i = 1; i < voiced.length - 1; i++) {
    const w = [voiced[i - 1].st, voiced[i].st, voiced[i + 1].st].sort((x, y) => x - y);
    if (Math.abs(voiced[i].st - w[1]) > 3) voiced[i].st = w[1];
  }
  // 相对上一个有效帧跳超过 7 半音的，判为八度错误，不参与音域统计
  let prev = null;
  for (const f of voiced) {
    if (prev != null && Math.abs(f.st - prev) > 7) f.st = null;
    else prev = f.st;
  }
  return frames;
}

function bestLag(x, start, minLag, maxLag) {
  // 归一化自相关，取峰值 lag（和 Python 版 measure.py 同一套做法）。
  // 早期版本取"最长且 ≥0.88 峰值的 lag"，会在女声上系统性低八度——
  // 2 倍周期的相关系数常能到峰值的 0.9，于是 260Hz 被判成 130Hz。
  const n = FRAME;
  let peak = 0, peakLag = 0;
  const corr = new Float32Array(maxLag + 2);
  // 去直流：说话时帧内均值不为 0，留着会抬高长 lag 的相关
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[start + i];
  mean /= n;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < n - lag; i++) {
      const a = x[start + i] - mean, b = x[start + i + lag] - mean;
      s += a * b; e1 += a * a; e2 += b * b;
    }
    const c = s / (Math.sqrt(e1 * e2) + 1e-9);
    corr[lag] = c;
    if (c > peak) { peak = c; peakLag = lag; }
  }
  if (peak <= 0 || !peakLag) return { lag: null, conf: 0 };
  // 抛物线插值细化峰位，减少 1 个 lag 的量化误差
  const a = corr[peakLag - 1] ?? peak, b = peak, c = corr[peakLag + 1] ?? peak;
  const denom = a - 2 * b + c;
  const shift = Math.abs(denom) > 1e-9 ? 0.5 * (a - c) / denom : 0;
  return { lag: peakLag + shift, conf: peak };
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

function segmentByGaps(words, gapSec, maxLen, silenceRatio = () => 1) {
  const segs = [];
  let cur = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (cur.length) {
      const gap = w.start - prev.end;
      const silent = gap > gapSec && silenceRatio(prev.end, w.start) >= 0.7;
      const tooLong = w.start - cur[0].start > maxLen;
      if (silent || tooLong) {
        segs.push({ words: cur, start: cur[0].start, end: prev.end });
        cur = [];
      }
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
