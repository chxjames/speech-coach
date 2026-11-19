// 打分：把韵律/画面指标换算成 0-100。
// 三档水平用同一批指标、不同的目标值（见 LEVELS），不给人"入门就该被骂"的体验。

export const PROFILES = {
  camera: { content: 25, pacing: 20, prosody: 15, clarity: 15, body: 5, production: 20 },
  stage:  { content: 25, pacing: 20, prosody: 20, clarity: 15, body: 15, production: 5 },
};

// 每个数后面都标了它从哪来；SCORING.md 里列了完整出处
export const LEVELS = {
  // 入门：能讲完、有停顿、句子别太长。宽容度按 Foulke 1968（125–250 wpm 理解无损）
  starter: {
    rate: [140, 55], pause: [0.9, 1.3], longMax: 16,
    range: [6.5, 4], sd: [2.0, 1.5], riseTol: 0.45,
    artic: [200, 80], filler: [3.0, 2.5], motion: 5,
  },
  // 进阶：目标等于"职业演讲者的平均"（150 wpm，HBR 2018 引 Missouri 研究）
  solid: {
    rate: [150, 45], pause: [1.2, 1.0], longMax: 13,
    range: [8.0, 4], sd: [2.8, 1.5], riseTol: 0.35,
    artic: [210, 65], filler: [1.8, 2.0], motion: 8,
  },
  // 专业：比赛/路演。音域和句间变化的要求往上抬（Journal of Voice 1993：受过训练者音域更大）
  pro: {
    rate: [150, 38], pause: [1.4, 0.8], longMax: 11,
    range: [10.0, 4], sd: [3.5, 1.5], riseTol: 0.25,
    artic: [220, 55], filler: [1.0, 1.5], motion: 10,
  },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const gauss = (x, mu, sigma, max) => max * Math.exp(-Math.pow((x - mu) / sigma, 2));

export function score({ s, video, profile = 'camera', level = 'solid', manual = {} }) {
  const W = PROFILES[profile];
  const L = LEVELS[level] || LEVELS.solid;
  const content = manual.content ?? 18;      // 0-25，人工

  // 节奏：净语速（稳，跨模型可比）+ 停顿 + 句子过长扣分
  const rateScore = gauss(s.wpm, L.rate[0], L.rate[1], 10);
  let pauseScore = gauss(s.pauseAvg, L.pause[0], L.pause[1], 10);
  if (s.pauses < 5) pauseScore *= 0.6;
  const longPenalty = clamp((s.longest - L.longMax) / 6, 0, 1) * 3;
  const pacing = Math.max(0, rateScore + pauseScore - longPenalty);

  // 语调：音域（Aoyama 2016：成年男性读稿 6.4 半音、女性 8.1；受训者更大）+ 句间变化 + 句尾升降
  const rangeScore = s.rangeSt != null ? gauss(s.rangeSt, L.range[0], L.range[1], 6) : 4;
  const sdScore = gauss(s.segSdSt, L.sd[0], L.sd[1], 8);
  const totalFinals = s.finals.falling + s.finals.flat + s.finals.rising || 1;
  const fallShare = s.finals.falling / totalFinals;
  const riseShare = s.finals.rising / totalFinals;
  const finalScore = 6 * clamp(fallShare / 0.45, 0, 1) * (1 - clamp((riseShare - L.riseTol) / 0.35, 0, 1) * 0.6);
  const prosody = rangeScore + sdScore + finalScore;

  // 清晰：发音速率（Laver 1994 经 Rogers 2000：平均 5 音节/秒 ≈ 200 wpm）+ 软化词密度
  const articScore = gauss(s.articWpm, L.artic[0], L.artic[1], 8);
  const cleanScore = gauss(s.fillerRate, L.filler[0], L.filler[1], 7);
  const clarity = articScore + cleanScore;

  // 身体（自动）：画面动作幅度
  const motion = video?.motionAvg ?? 0;
  const body = W.body * clamp(motion / L.motion, 0, 1);

  // 制作：自动部分只算技术项（分辨率/码率/曝光），剩下的构图与灯光交给人
  const autoBudget = Math.min(12, W.production);
  const compBudget = W.production - autoBudget;
  // 读不出画面时（格式不支持、尺寸拿不到）不罚分：技术项按满分算，只留构图滑杆
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

  return { total: Object.values(dims).reduce((a, d) => a + d.got, 0), dims, profile, level, compBudget };
}

// 把差异换算成"你该改什么"，按丢分排序。
// 只返回 key + vars，文案在 js/i18n.js 里（中英各一份），页面和报告共用同一个 t()。
export function findings({ s, video, scored, level = 'solid' }) {
  const L = LEVELS[level] || LEVELS.solid;
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
  if (rise / t > 0.33) out.push({
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
