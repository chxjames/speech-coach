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
    label: '入门',
    rate: [140, 55], pause: [0.9, 1.3], longMax: 16,
    range: [6.5, 4], sd: [2.0, 1.5], riseTol: 0.45,
    artic: [200, 80], filler: [3.0, 2.5], motion: 5,
  },
  // 进阶：目标等于"职业演讲者的平均"（150 wpm，HBR 2018 引 Missouri 研究）
  solid: {
    label: '进阶',
    rate: [150, 45], pause: [1.2, 1.0], longMax: 13,
    range: [8.0, 4], sd: [2.8, 1.5], riseTol: 0.35,
    artic: [210, 65], filler: [1.8, 2.0], motion: 8,
  },
  // 专业：比赛/路演。音域和句间变化的要求往上抬（Journal of Voice 1993：受过训练者音域更大）
  pro: {
    label: '专业',
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
  const px = (video?.width || 0) * (video?.height || 0);
  const resScore = autoBudget / 3 * clamp(Math.sqrt(px) / 720, 0, 1);
  const kbps = video?.bitrateKbps ?? 0;
  const bitScore = autoBudget / 3 * clamp(Math.pow(kbps / 2000, 0.6), 0, 1);
  const luma = video?.lumaMedian ?? 120;
  const expScore = autoBudget / 3 * clamp(Math.exp(-Math.pow((luma - 115) / 50, 2)), 0, 1);
  const composition = manual.composition ?? compBudget * 0.5;
  const production = resScore + bitScore + expScore + composition;

  const cap = (v, max) => Math.min(v, max);   // 分量之和可能超过维度上限（讲台的语调上限 20），封顶
  const dims = {
    content: { got: cap(content, W.content), max: W.content, manual: true },
    pacing: { got: cap(pacing, W.pacing), max: W.pacing, parts: { rateScore, pauseScore, longPenalty } },
    prosody: { got: cap(prosody, W.prosody), max: W.prosody, parts: { rangeScore, sdScore, finalScore } },
    clarity: { got: cap(clarity, W.clarity), max: W.clarity, parts: { articScore, cleanScore } },
    body: { got: cap(body, W.body), max: W.body },
    production: { got: cap(production, W.production), max: W.production, manual: compBudget > 0, parts: { resScore, bitScore, expScore, composition } },
  };

  return { total: Object.values(dims).reduce((a, d) => a + d.got, 0), dims, profile, level, compBudget };
}

// 把差异换算成"你该改什么"，按丢分排序
export function findings({ s, video, scored, level = 'solid' }) {
  const L = LEVELS[level] || LEVELS.solid;
  const out = [];
  const d = scored.dims;
  const lost = (k) => d[k].max - d[k].got;

  if (s.fillerRate > L.filler[0] * 1.6) out.push({
    dim: 'clarity', lost: lost('clarity'),
    text: `软化词密度 ${s.fillerRate.toFixed(1)}/100 词（专业演讲者 0.5–1.9）。like / just / actually / really / pretty 每 17 个词就冒一个，听感发软。`,
  });
  if (d.production.got < d.production.max * 0.7) out.push({
    dim: 'production', lost: lost('production'),
    text: `画面 ${Math.round(video?.width || 0)}×${Math.round(video?.height || 0)}，中位亮度 ${Math.round(video?.lumaMedian ?? 0)}。构图和灯光还能再拿 ${lost('production').toFixed(1)} 分。`,
  });
  const t = s.finals.falling + s.finals.flat + s.finals.rising || 1;
  if (s.finals.rising / t > 0.33) out.push({
    dim: 'prosody', lost: lost('prosody'),
    text: `句尾上扬占 ${Math.round(s.finals.rising / t * 100)}%（${s.finals.rising}/${t}）。陈述句句尾该往下落，上扬留给问句。`,
  });
  if (s.articWpm > L.artic[0] + 0.8 * L.artic[1]) out.push({
    dim: 'pacing', lost: lost('pacing'),
    text: `发音速率 ${Math.round(s.articWpm)} wpm，只有真正开口时才这么快，容易连读吃掉辅音。`,
  });
  if (s.longest > L.longMax) out.push({
    dim: 'pacing', lost: lost('pacing'),
    text: `最长一句 ${s.longest.toFixed(1)} 秒。超过 10 秒的句子，观众会丢失主语。`,
  });
  if ((video?.motionAvg ?? 0) < L.motion * 0.7) out.push({
    dim: 'body', lost: lost('body'),
    text: `画面动作幅度 ${(video?.motionAvg ?? 0).toFixed(1)}（专业对镜头演讲者在 9–10）。手势太小，手可能根本没进画。`,
  });
  return out.sort((a, b) => b.lost - a.lost);
}
