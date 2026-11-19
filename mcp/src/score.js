// 打分：把韵律/画面指标换算成 0-100。
//
// 三个正交的旋钮，各自管一件事，互不重叠：
//   形态 profile —— 你在哪儿讲（对镜头 / 讲台），只决定基础权重
//   场景 scene   —— 这场讲给谁、为什么讲，决定"这套标准更看重什么"（权重乘数 + 目标值覆盖）
//   水平 level   —— 你练到哪一步，决定宽容度（目标值基准）
//
// 目标值来自 12 个 3MT 获奖演讲的实测中位数（见 SCORING.md 的表），不是拍的。

export const PROFILES = {
  camera: { content: 25, pacing: 20, prosody: 15, clarity: 15, body: 5, production: 20 },
  stage:  { content: 25, pacing: 20, prosody: 20, clarity: 15, body: 15, production: 5 },
};

// 场景：scale 是对上面基础权重的乘数，归一化到 100。
// targets 覆盖水平档的目标值——同一个指标，在不同场合该达到的数不一样。
export const SCENES = {
  // 课堂作业 / 平时练习：讲完、讲清就行，宽容
  homework: {
    scale: { content: 0.85, pacing: 1.0, prosody: 0.85, clarity: 1.15, body: 1.2, production: 1.0 },
    targets: { rate: 150, pause: 0.75, longMax: 12, filler: 2.5 },
  },
  // 期末展示 / 课程汇报：内容要多，结构要清
  final: {
    scale: { content: 1.10, pacing: 1.0, prosody: 1.0, clarity: 1.0, body: 1.0, production: 1.0 },
    targets: { longMax: 11, filler: 2.0 },
  },
  // 比赛（3MT 一类）：完全按 12 个获奖者的实测画像
  contest: {
    scale: { content: 1.0, pacing: 1.0, prosody: 1.15, clarity: 1.0, body: 1.1, production: 0.8 },
    targets: { rate: 160, pause: 0.70, longMax: 10, range: 9.5, sd: 1.9, riseTol: 0.45, artic: 190, filler: 1.5, motion: 8 },
  },
  // 面试 / 求职：宁可短、宁可干净，别啰嗦
  interview: {
    scale: { content: 0.80, pacing: 1.1, prosody: 1.0, clarity: 1.35, body: 1.2, production: 0.5 },
    targets: { rate: 155, pause: 0.80, longMax: 8, filler: 0.8, artic: 190 },
  },
  // 答辩 / 评审：内容最重，术语可以有，语速慢一点没关系
  defense: {
    scale: { content: 1.35, pacing: 0.8, prosody: 0.8, clarity: 1.0, body: 0.6, production: 1.0 },
    targets: { rate: 145, pause: 1.00, longMax: 13, range: 7.0, sd: 2.2, filler: 2.5, motion: 6 },
  },
  // 路演 / 推销：要冲、要起伏、要有停顿砸重点
  pitch: {
    scale: { content: 1.0, pacing: 1.0, prosody: 1.2, clarity: 1.05, body: 1.1, production: 0.9 },
    targets: { rate: 165, pause: 0.60, longMax: 9, range: 11, sd: 2.2, filler: 1.0, motion: 10 },
  },
};

// 水平档的基准目标值。校准依据：12 个 3MT 获奖演讲（净语速中位 159、平均停顿 0.69、
// 最长句 8.4s、音域 9.9 半音、句间 SD 1.9、句尾升调 33%）。
export const LEVELS = {
  starter: { rate: [145, 55], pause: [0.75, 1.30], longMax: 13, range: [7.5, 4], sd: [1.5, 1.5], riseTol: 0.50, artic: [200, 80], filler: [2.5, 2.5], motion: 5 },
  solid:   { rate: [160, 45], pause: [0.80, 1.00], longMax: 10, range: [9.0, 4], sd: [1.9, 1.5], riseTol: 0.45, artic: [190, 65], filler: [1.5, 2.0], motion: 8 },
  pro:     { rate: [165, 38], pause: [0.75, 0.80], longMax: 9,  range: [11.0, 4], sd: [2.4, 1.5], riseTol: 0.40, artic: [185, 55], filler: [1.0, 1.5], motion: 10 },
};

// 基础权重 × 场景乘数，再归一化到 100（小数保留一位，误差补给内容维度）
export function weightsFor(profile, scene) {
  const base = PROFILES[profile] || PROFILES.camera;
  const sc = (SCENES[scene] || SCENES.final).scale;
  const raw = {}, keys = Object.keys(base);
  let sum = 0;
  for (const k of keys) { raw[k] = base[k] * (sc[k] == null ? 1 : sc[k]); sum += raw[k]; }
  const out = {};
  let acc = 0;
  for (const k of keys) { out[k] = Math.round(raw[k] / sum * 1000) / 10; acc += out[k]; }
  out.content = Math.round((out.content + (100 - acc)) * 10) / 10;
  return out;
}

// 水平档给基准，场景覆盖该场合特有的目标
export function targetsFor(level, scene) {
  const base = LEVELS[level] || LEVELS.solid;
  const sc = (SCENES[scene] || SCENES.final).targets || {};
  const L = { ...base };
  for (const k of Object.keys(sc)) {
    const v = sc[k];
    if (Array.isArray(base[k])) L[k] = [v, base[k][1]];   // 只换目标值，保留宽容度
    else L[k] = v;
  }
  return L;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const gauss = (x, mu, sigma, max) => max * Math.exp(-Math.pow((x - mu) / sigma, 2));

export function score({ s, video, profile = 'camera', level = 'solid', scene = 'final', manual = {} }) {
  const W = weightsFor(profile, scene);
  const L = targetsFor(level, scene);
  const content = manual.content ?? W.content * 0.72;   // 默认按 72% 给，人工可拖

  // 节奏：净语速（稳，跨模型可比）+ 停顿 + 句子过长扣分
  const rateScore = gauss(s.wpm, L.rate[0], L.rate[1], 10);
  let pauseScore = gauss(s.pauseAvg, L.pause[0], L.pause[1], 10);
  if (s.pauses < 5) pauseScore *= 0.6;
  const longPenalty = clamp((s.longest - L.longMax) / 6, 0, 1) * 3;
  const pacing = Math.max(0, rateScore + pauseScore - longPenalty);

  // 语调：音域 + 句间变化 + 句尾（只看一句话的结尾该不该降，分句的升调不管）
  const rangeScore = s.rangeSt != null ? gauss(s.rangeSt, L.range[0], L.range[1], 6) : 4;
  const sdScore = gauss(s.segSdSt, L.sd[0], L.sd[1], 8);
  const totalFinals = s.finals.falling + s.finals.flat + s.finals.rising || 1;
  const fallShare = s.finals.falling / totalFinals;
  const riseShare = s.finals.rising / totalFinals;
  const finalScore = 6 * clamp(fallShare / 0.45, 0, 1) * (1 - clamp((riseShare - L.riseTol) / 0.35, 0, 1) * 0.6);
  const prosody = rangeScore + sdScore + finalScore;

  // 清晰：发音速率 + 软化词密度（面试档最狠，答辩最宽）
  const articScore = gauss(s.articWpm, L.artic[0], L.artic[1], 8);
  const cleanScore = gauss(s.fillerRate, L.filler[0], L.filler[1], 7);
  const clarity = articScore + cleanScore;

  // 身体（自动）：画面动作幅度
  const motion = video?.motionAvg ?? 0;
  const body = W.body * clamp(motion / L.motion, 0, 1);

  // 制作：自动部分只算技术项（分辨率/码率/曝光），剩下的构图与灯光交给人
  const autoBudget = Math.min(12, W.production);
  const compBudget = W.production - autoBudget;
  const frameKnown = !!(video && video.width && video.height);
  const px = frameKnown ? video.width * video.height : 0;
  const resScore = frameKnown ? autoBudget / 3 * clamp(Math.sqrt(px) / 720, 0, 1) : autoBudget / 3;
  const kbps = video?.bitrateKbps ?? 0;
  const bitScore = frameKnown ? autoBudget / 3 * clamp(Math.pow(kbps / 2000, 0.6), 0, 1) : autoBudget / 3;
  const luma = video?.lumaMedian ?? 115;
  const expScore = frameKnown ? autoBudget / 3 * clamp(Math.exp(-Math.pow((luma - 115) / 50, 2)), 0, 1) : autoBudget / 3;
  const composition = manual.composition ?? compBudget * 0.5;
  const production = resScore + bitScore + expScore + composition;

  const cap = (v, max) => Math.min(v, max);   // 分量之和可能超过维度上限（讲台的语调上限 20），封顶
  const dims = {
    content: { got: cap(content, W.content), max: W.content, manual: true },
    pacing: { got: cap(pacing, W.pacing), max: W.pacing, parts: { rateScore, pauseScore, longPenalty } },
    prosody: { got: cap(prosody, W.prosody), max: W.prosody, parts: { rangeScore, sdScore, finalScore } },
    clarity: { got: cap(clarity, W.clarity), max: W.clarity, parts: { articScore, cleanScore } },
    body: { got: cap(body, W.body), max: W.body },
    production: { got: cap(production, W.production), max: W.production, manual: compBudget > 0, frameKnown, parts: { resScore, bitScore, expScore, composition } },
  };

  return {
    total: Object.values(dims).reduce((a, d) => a + d.got, 0),
    dims, profile, level, scene, weights: W, targets: L, compBudget,
  };
}

// 把差异换算成"你该改什么"，按丢分排序。
// 只返回 key + vars，文案在 js/i18n.js 里（中英各一份），页面和报告共用同一个 t()。
export function findings({ s, video, scored, level = 'solid', scene = 'final' }) {
  const L = scored.targets || targetsFor(level, scene);
  const out = [];
  const d = scored.dims;
  const lost = (k) => d[k].max - d[k].got;
  const rise = s.finals.rising;

  if (s.fillerRate > L.filler[0] * 1.6) out.push({
    dim: 'clarity', lost: lost('clarity'), key: 'tip.fillers',
    vars: { rate: s.fillerRate.toFixed(1) },
  });
  if (d.production.frameKnown && d.production.got < d.production.max * 0.7) out.push({
    dim: 'production', lost: lost('production'), key: 'tip.production',
    vars: {
      w: Math.round(video?.width || 0), h: Math.round(video?.height || 0),
      luma: Math.round(video?.lumaMedian ?? 0), lost: lost('production').toFixed(1),
    },
  });
  const t = s.finals.falling + s.finals.flat + rise || 1;
  if (rise / t > L.riseTol) out.push({
    dim: 'prosody', lost: lost('prosody'), key: 'tip.finals',
    vars: { pct: Math.round(rise / t * 100), n: rise, total: t },
  });
  if (s.articWpm > L.artic[0] + 0.8 * L.artic[1]) out.push({
    dim: 'pacing', lost: lost('pacing'), key: 'tip.artic',
    vars: { wpm: Math.round(s.articWpm) },
  });
  if (s.longest > L.longMax) out.push({
    dim: 'pacing', lost: lost('pacing'), key: 'tip.longest',
    vars: { sec: s.longest.toFixed(1) },
  });
  if ((video?.motionAvg ?? 0) < L.motion * 0.7) out.push({
    dim: 'body', lost: lost('body'), key: 'tip.motion',
    vars: { motion: (video?.motionAvg ?? 0).toFixed(1) },
  });
  return out.sort((a, b) => b.lost - a.lost);
}
