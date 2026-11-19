// 打分：把韵律/画面指标换算成 0-100。
// 与 Python 版 score.py 同一套公式，差别在于浏览器里拿不到人工分的那几项，
// 所以"内容"和"咬字"改成滑杆，默认值是中性估计。

export const PROFILES = {
  camera: { content: 25, pacing: 20, prosody: 15, clarity: 15, body: 5, production: 20 },
  stage:  { content: 25, pacing: 20, prosody: 20, clarity: 15, body: 15, production: 5 },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const gauss = (x, mu, sigma, max) => max * Math.exp(-Math.pow((x - mu) / sigma, 2));

export function score({ s, video, profile = 'camera', manual = {} }) {
  const W = PROFILES[profile];
  const content = manual.content ?? 18;      // 0-25，人工

  // 节奏：净语速（稳，跨模型可比）+ 停顿 + 句子过长扣分
  const rateScore = gauss(s.wpm, 150, 40, 10);
  let pauseScore = gauss(s.pauseAvg, 1.2, 0.9, 10);
  if (s.pauses < 5) pauseScore *= 0.6;
  const longPenalty = clamp((s.longest - 12) / 6, 0, 1) * 3;   // 超过 12 秒开始扣
  const pacing = Math.max(0, rateScore + pauseScore - longPenalty);

  // 语调
  const rangeScore = s.rangeSt != null ? gauss(s.rangeSt, 10.5, 4, 6) : 4;
  const sdScore = gauss(s.segSdSt, 3, 1.5, 8);
  const totalFinals = s.finals.falling + s.finals.flat + s.finals.rising || 1;
  const fallShare = s.finals.falling / totalFinals;
  const riseShare = s.finals.rising / totalFinals;
  const finalScore = 6 * clamp(fallShare / 0.45, 0, 1) * (1 - clamp((riseShare - 0.35) / 0.35, 0, 1) * 0.6);
  const prosody = rangeScore + sdScore + finalScore;

  // 清晰：发音速率（连读太快会吃掉辅音）+ 软化词密度
  const articScore = gauss(s.articWpm, 240, 55, 8);
  const cleanScore = gauss(s.fillerRate, 1.5, 2, 7);
  const clarity = articScore + cleanScore;

  // 身体（自动）：画面动作幅度
  const motion = video?.motionAvg ?? 0;
  const body = W.body * clamp(motion / 10, 0, 1);

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

  const dims = {
    content: { got: content, max: W.content, manual: true },
    pacing: { got: pacing, max: W.pacing, parts: { rateScore, pauseScore, longPenalty } },
    prosody: { got: prosody, max: W.prosody, parts: { rangeScore, sdScore, finalScore } },
    clarity: { got: clarity, max: W.clarity, parts: { articScore, cleanScore } },
    body: { got: body, max: W.body },
    production: { got: production, max: W.production, manual: compBudget > 0, parts: { resScore, bitScore, expScore, composition } },
  };

  return { total: Object.values(dims).reduce((a, d) => a + d.got, 0), dims, profile, compBudget };
}

// 把差异换算成"你该改什么"，按丢分排序
export function findings({ s, video, scored }) {
  const out = [];
  const d = scored.dims;
  const lost = (k) => d[k].max - d[k].got;

  if (s.fillerRate > 3) out.push({
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
  if (s.articWpm > 265) out.push({
    dim: 'pacing', lost: lost('pacing'),
    text: `发音速率 ${Math.round(s.articWpm)} wpm，只有真正开口时才这么快，容易连读吃掉辅音。`,
  });
  if (s.longest > 12) out.push({
    dim: 'pacing', lost: lost('pacing'),
    text: `最长一句 ${s.longest.toFixed(1)} 秒。超过 10 秒的句子，观众会丢失主语。`,
  });
  if ((video?.motionAvg ?? 0) < 7) out.push({
    dim: 'body', lost: lost('body'),
    text: `画面动作幅度 ${(video?.motionAvg ?? 0).toFixed(1)}（专业对镜头演讲者在 9–10）。手势太小，手可能根本没进画。`,
  });
  return out.sort((a, b) => b.lost - a.lost);
}
