// 打分：把韵律/画面指标换算成 0-100。
//
// 四个旋钮，各自管一件事：
//   format —— 形态：stage（讲台）/ desk（桌前、网课、对镜头）。决定基础权重和目标值。
//   scene  —— 场景：比赛/面试/答辩/路演/课堂/汇报。只给权重乘数和相对形态的目标偏移。
//   level  —— 水平：入门/进阶/专业。决定宽容度（sigma 倍数）和少量目标偏移。
//   manual —— 人工：内容/构图自评。它不是测量，页面和报告都要说清楚。
//
// 目标值 en-1.0：stage 用本引擎 + small.en 重新量了 12 个 3MT 获奖者，
// stage + contest + solid 的目标 = 获奖者中位数（去掉 2 个静音测不准的）。
// desk 没有带标签的样本，只按同样的引擎偏差平移，仍是 provisional。
// 没有测到的维度返回 got: null，不按满分算。

// 评分标准的版本。改了公式、权重或目标值就要升版本，并重新生成 golden 测试数据
// （mcp/test/fixtures/golden-scores.json）。不同版本的分数不能直接比。
export const RUBRIC_VERSION = 'en-1.0';

// 目标值是用这个模型量出来的。换模型（尤其是 base.en / tiny.en）词数和语速会系统性偏高，
// 分数只能和同一模型的结果比。
export const REFERENCE_MODEL = 'Xenova/whisper-small.en';

export const FORMATS = {
  desk: {
    weights: { content: 25, pacing: 20, prosody: 15, clarity: 15, body: 5, production: 20 },
    targets: {
      rate: [175, 40], pause: [0.64, 0.80], longMax: 13,
      range: [9.5, 3.5], sd: [1.7, 1.3], riseTol: 0.70,
      artic: [205, 60], filler: [1.5, 1.8], motion: 4,
    },
  },
  stage: {
    weights: { content: 25, pacing: 20, prosody: 20, clarity: 15, body: 15, production: 5 },
    targets: {
      rate: [155, 45], pause: [0.98, 1.0], longMax: 15,
      range: [12.0, 4.0], sd: [2.0, 1.5], riseTol: 0.65,
      artic: [190, 65], filler: [1.5, 2.0], motion: 8,
    },
  },
};

// 旧名字：camera = desk。保留给旧调用和旧报告。
export const PROFILES = {
  camera: FORMATS.desk.weights,
  stage: FORMATS.stage.weights,
};

export function normalizeFormat(format) {
  if (format === 'stage') return 'stage';
  return 'desk'; // desk / camera / 空值都按桌前处理
}

// 场景：scale 是基础权重的乘数；targets 是相对形态目标值的偏移，不是绝对值。
// 这样 stage + contest 和 desk + contest 会各自保留自己的基础目标。
export const SCENES = {
  // 课堂作业 / 平时练习：讲完、讲清就行，宽容
  homework: {
    scale: { content: 0.85, pacing: 1.0, prosody: 0.85, clarity: 1.15, body: 1.2, production: 1.0 },
    targets: {
      stage: { rate: -5, pause: -0.05, longMax: 2, range: -0.5, sd: -0.2, artic: 5, filler: 1.0, motion: -1 },
      desk:  { rate: -5, pause: -0.05, longMax: 2, range: -0.5, sd: -0.2, artic: 5, filler: 1.0, motion: -1 },
    },
  },
  // 期末展示 / 课程汇报：内容要多，结构要清
  final: {
    scale: { content: 1.10, pacing: 1.0, prosody: 1.0, clarity: 1.0, body: 1.0, production: 1.0 },
    targets: {
      stage: { longMax: 1, filler: 0.5 },
      desk:  { longMax: 1, filler: 0.5 },
    },
  },
  // 比赛（3MT 一类）：节奏紧、语调有起伏
  contest: {
    scale: { content: 1.0, pacing: 1.0, prosody: 1.15, clarity: 1.0, body: 1.1, production: 0.8 },
    targets: {
      stage: { rate: 5, pause: -0.15, longMax: -1, range: -0.5, sd: -0.1, artic: 5, filler: 0, motion: 0 },
      desk:  { rate: -5, pause: -0.05, longMax: -1, range: -0.5, sd: -0.1, artic: 5, filler: 0, motion: 0 },
    },
  },
  // 面试 / 求职：宁可短、宁可干净，别啰嗦
  interview: {
    scale: { content: 0.80, pacing: 1.1, prosody: 1.0, clarity: 1.35, body: 1.2, production: 0.5 },
    targets: {
      stage: { rate: -5, pause: -0.05, longMax: -3, range: -0.5, sd: -0.2, artic: 5, filler: -0.7, motion: -1 },
      desk:  { rate: -5, pause: 0.05, longMax: -2, range: -0.5, sd: -0.2, artic: 5, filler: -0.7, motion: -1 },
    },
  },
  // 答辩 / 评审：内容最重，术语可以有，语速慢一点没关系
  defense: {
    scale: { content: 1.35, pacing: 0.8, prosody: 0.8, clarity: 1.0, body: 0.6, production: 1.0 },
    targets: {
      stage: { rate: -10, pause: 0.15, longMax: 2, range: -3.0, sd: 0.2, artic: 0, filler: 1.0, motion: -2 },
      desk:  { rate: -10, pause: 0.15, longMax: 2, range: -3.0, sd: 0.2, artic: 0, filler: 1.0, motion: -2 },
    },
  },
  // 路演 / 推销：要冲、要起伏、要有停顿砸重点
  pitch: {
    scale: { content: 1.0, pacing: 1.0, prosody: 1.2, clarity: 1.05, body: 1.1, production: 0.9 },
    targets: {
      stage: { rate: 10, pause: -0.25, longMax: -2, range: 1.0, sd: 0.2, artic: 0, filler: -0.5, motion: 2 },
      desk:  { rate: 5, pause: -0.10, longMax: -1, range: 1.0, sd: 0.2, artic: 0, filler: -0.5, motion: 2 },
    },
  },
};

// 水平：tolerance 乘在 sigma 上；shift 是目标值的小偏移。
// 入门更宽、目标更容易；专业更严、目标更高。它不再直接覆盖形态目标。
export const LEVELS = {
  starter: {
    tolerance: 1.35,
    shift: { rate: -10, pause: -0.05, longMax: 2, range: -1.5, sd: -0.3, riseTol: 0.05, artic: 10, filler: 1.0, motion: -2 },
  },
  solid: { tolerance: 1.0, shift: {} },
  pro: {
    tolerance: 0.8,
    shift: { rate: 5, pause: -0.05, longMax: -1, range: 1.0, sd: 0.3, riseTol: -0.05, artic: -5, filler: -0.5, motion: 1 },
  },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const gauss = (x, mu, sigma, max) => max * Math.exp(-Math.pow((x - mu) / sigma, 2));
const finite = (x) => Number.isFinite(x);

// 子项的原始满分（节奏 10+10、语调 6+8+6、清晰 8+7）。场景乘数会改变维度权重 W，
// 所以原始分要按 W / 原始满分 等比换算，否则权重被放大的维度永远拿不满，被缩小的维度轻易顶格。
export const RAW_MAX = { pacing: 20, prosody: 20, clarity: 15 };

// 静音段测得准不准。停顿、最长一句、发音速率都靠"哪里安静"来算；录音带背景音乐或压缩很重时
// 安静的地方找不到，每分钟只剩一两处停顿，这三个数就不可信。正常演讲每分钟 5 处以上。
// 30 秒以下的片段停顿太少，不做这个判断。
export const MIN_PAUSES_PER_MIN = 4;
export function silenceReliable(s) {
  if (!s || !finite(s.pauses)) return false;
  const span = finite(s.spanSec) && s.spanSec > 0 ? s.spanSec : s.speechSec;
  if (!finite(span) || span < 30) return true;
  return s.pauses / (span / 60) >= MIN_PAUSES_PER_MIN;
}
const rescale = (raw, k, W) => clamp(raw, 0, RAW_MAX[k]) / RAW_MAX[k] * W[k];

// 基础权重 × 场景乘数，再归一化到 100（小数保留一位，误差补给内容维度）
export function weightsFor(format, scene) {
  const base = FORMATS[normalizeFormat(format)].weights;
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

// target = format_base + scene_delta + level_shift；sigma = format_sigma × level_tolerance
export function targetsFor(format, scene, level = 'solid') {
  const fmt = normalizeFormat(format);
  const base = FORMATS[fmt].targets;
  const scAll = (SCENES[scene] || SCENES.final).targets || {};
  const sc = scAll[fmt] || scAll;
  const lv = LEVELS[level] || LEVELS.solid;
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k];
    const d = (sc[k] || 0) + (lv.shift[k] || 0);
    out[k] = Array.isArray(b) ? [b[0] + d, b[1] * lv.tolerance] : b + d;
  }
  return out;
}

export function score({ s, video, format, profile, level = 'solid', scene = 'final', manual = {} }) {
  const fmt = normalizeFormat(format || profile || 'desk');
  const W = weightsFor(fmt, scene);
  const L = targetsFor(fmt, scene, level);
  const audioKnown = !!s && finite(s.words) && s.words >= 5 && !!s.finals;
  const pitchKnown = audioKnown && finite(s.rangeSt) && finite(s.segSdSt);
  const videoKnown = !!video && finite(video.width) && finite(video.height) && finite(video.motionAvg);
  const silenceKnown = audioKnown && silenceReliable(s);

  const contentEstimated = !finite(manual.content);
  const content = contentEstimated ? W.content * 0.72 : manual.content;
  const dims = {
    content: {
      got: clamp(content, 0, W.content), max: W.content,
      available: true, manual: true, estimated: contentEstimated,
      reason: contentEstimated ? 'estimated' : null,
    },
  };

  // 节奏：净语速 + 停顿 + 句子过长扣分。静音测不准时只看净语速（它只靠首末词时间戳）。
  if (audioKnown && finite(s.wpm) && finite(s.pauseAvg) && finite(s.longest)) {
    const rateScore = gauss(s.wpm, L.rate[0], L.rate[1], 10);
    if (silenceKnown) {
      let pauseScore = gauss(s.pauseAvg, L.pause[0], L.pause[1], 10);
      if (s.pauses < 5) pauseScore *= 0.6;
      const longPenalty = clamp((s.longest - L.longMax) / 6, 0, 1) * 3;
      dims.pacing = {
        got: rescale(rateScore + pauseScore - longPenalty, 'pacing', W),
        max: W.pacing, available: true, parts: { rateScore, pauseScore, longPenalty },
      };
    } else {
      // 没测到的停顿部分从满分里拿掉（和"没测到的维度不按满分算"同一个规矩），不按语速分放大
      const max = Math.round(W.pacing * 10 / RAW_MAX.pacing * 10) / 10;
      dims.pacing = {
        got: clamp(rateScore, 0, 10) / 10 * max,
        max, available: true, partial: 'silence', parts: { rateScore },
      };
    }
  } else {
    dims.pacing = { got: null, max: W.pacing, available: false, reason: 'no-audio' };
  }

  // 语调：音域 + 句间变化 + 句尾
  if (pitchKnown) {
    const rangeScore = gauss(s.rangeSt, L.range[0], L.range[1], 6);
    const sdScore = gauss(s.segSdSt, L.sd[0], L.sd[1], 8);
    const totalFinals = s.finals.falling + s.finals.flat + s.finals.rising || 1;
    const fallShare = s.finals.falling / totalFinals;
    const riseShare = s.finals.rising / totalFinals;
    const finalScore = 6 * clamp(fallShare / 0.45, 0, 1) * (1 - clamp((riseShare - L.riseTol) / 0.35, 0, 1) * 0.6);
    dims.prosody = {
      got: rescale(rangeScore + sdScore + finalScore, 'prosody', W),
      max: W.prosody, available: true, parts: { rangeScore, sdScore, finalScore },
    };
  } else {
    dims.prosody = { got: null, max: W.prosody, available: false, reason: 'no-pitch' };
  }

  // 清晰：发音速率 + 软化词密度。软化词只罚多、不罚少：低于目标就是满分。
  // 静音测不准时发音速率不可信，只看软化词。
  if (audioKnown && finite(s.articWpm) && finite(s.fillerRate)) {
    const cleanScore = s.fillerRate <= L.filler[0] ? 7 : gauss(s.fillerRate, L.filler[0], L.filler[1], 7);
    if (silenceKnown) {
      const articScore = gauss(s.articWpm, L.artic[0], L.artic[1], 8);
      dims.clarity = {
        got: rescale(articScore + cleanScore, 'clarity', W),
        max: W.clarity, available: true, parts: { articScore, cleanScore },
      };
    } else {
      const max = Math.round(W.clarity * 7 / RAW_MAX.clarity * 10) / 10;
      dims.clarity = {
        got: clamp(cleanScore, 0, 7) / 7 * max,
        max, available: true, partial: 'silence', parts: { cleanScore },
      };
    }
  } else {
    dims.clarity = { got: null, max: W.clarity, available: false, reason: 'no-audio' };
  }

  // 身体：画面运动。没有视频就 null，不给 0 分、也不给满分。
  if (videoKnown) {
    const motion = video.motionAvg;
    dims.body = {
      got: clamp(W.body * clamp(motion / L.motion, 0, 1), 0, W.body),
      max: W.body, available: true, motion,
    };
  } else {
    dims.body = { got: null, max: W.body, available: false, reason: 'no-video' };
  }

  // 制作：有视频才自动算；没有视频就 null。
  const autoBudget = Math.min(12, W.production);
  const compBudget = Math.max(0, W.production - autoBudget);
  if (videoKnown) {
    const px = video.width * video.height;
    const kbps = finite(video.bitrateKbps) ? video.bitrateKbps : 0;
    const luma = finite(video.lumaMedian) ? video.lumaMedian : 115;
    const resScore = autoBudget / 3 * clamp(Math.sqrt(px) / 720, 0, 1);
    const bitScore = autoBudget / 3 * clamp(Math.pow(kbps / 2000, 0.6), 0, 1);
    const expScore = autoBudget / 3 * clamp(Math.exp(-Math.pow((luma - 115) / 50, 2)), 0, 1);
    const composition = finite(manual.composition) ? manual.composition : compBudget * 0.5;
    dims.production = {
      got: clamp(resScore + bitScore + expScore + composition, 0, W.production),
      max: W.production, available: true, manual: compBudget > 0, frameKnown: true,
      parts: { resScore, bitScore, expScore, composition },
    };
  } else {
    dims.production = {
      got: null, max: W.production, available: false, reason: 'no-video',
      manual: false, frameKnown: false,
    };
  }

  const coreKeys = ['content', 'pacing', 'prosody', 'clarity'];
  const coreComplete = coreKeys.every((k) => dims[k].available);
  const availableDims = Object.values(dims).filter((d) => d.available);
  const total = coreComplete ? availableDims.reduce((a, d) => a + d.got, 0) : null;
  const totalMax = coreComplete ? Math.round(availableDims.reduce((a, d) => a + d.max, 0) * 10) / 10 : null;
  const coverage = totalMax ? totalMax / 100 : 0;
  const complete = availableDims.length === Object.keys(dims).length && silenceKnown;

  // 每分钟停顿数，静音测不准时报告里要说出来
  const span = s && (finite(s.spanSec) && s.spanSec > 0 ? s.spanSec : s.speechSec);
  const pausesPerMin = s && finite(s.pauses) && finite(span) && span > 0 ? s.pauses / (span / 60) : null;

  return {
    total, totalMax, pausesPerMin, coverage, complete, coreComplete, silenceKnown,
    dims, format: fmt, profile: fmt, level, scene, weights: W, targets: L, compBudget,
    rubric: RUBRIC_VERSION,
  };
}

// 把差异换算成"你该改什么"，按丢分排序。
// 只返回 key + vars，文案在 js/i18n.js 里（中英各一份），页面和报告共用同一个 t()。
// 没测到的维度直接跳过，不拿它生成建议。
export function findings({ s, video, scored, format, level = 'solid', scene = 'final' }) {
  const L = scored.targets || targetsFor(format || scored.format, scene, level);
  const d = scored.dims;
  const lost = (k) => (d[k].available ? d[k].max - d[k].got : 0);
  const out = [];
  if (!s) return out;

  if (d.clarity.available && finite(s.fillerRate) && s.fillerRate > L.filler[0] * 1.6) out.push({
    dim: 'clarity', lost: lost('clarity'), key: 'tip.fillers',
    vars: { rate: s.fillerRate.toFixed(1) },
  });
  if (d.production.available && d.production.frameKnown && d.production.got < d.production.max * 0.7) out.push({
    dim: 'production', lost: lost('production'), key: 'tip.production',
    vars: {
      w: Math.round(video?.width || 0), h: Math.round(video?.height || 0),
      luma: Math.round(video?.lumaMedian ?? 0), lost: lost('production').toFixed(1),
    },
  });
  if (d.prosody.available && finite(s.finals?.rising) && finite(s.finals?.falling) && finite(s.finals?.flat)) {
    const total = s.finals.falling + s.finals.flat + s.finals.rising || 1;
    if (s.finals.rising / total > L.riseTol) out.push({
      dim: 'prosody', lost: lost('prosody'), key: 'tip.finals',
      vars: { pct: Math.round(s.finals.rising / total * 100), n: s.finals.rising, total },
    });
  }
  if (d.clarity.available && scored.silenceKnown && finite(s.articWpm) && s.articWpm > L.artic[0] + 0.8 * L.artic[1]) out.push({
    dim: 'clarity', lost: lost('clarity'), key: 'tip.artic',
    vars: { wpm: Math.round(s.articWpm) },
  });
  if (d.pacing.available && scored.silenceKnown && finite(s.longest) && s.longest > L.longMax) out.push({
    dim: 'pacing', lost: lost('pacing'), key: 'tip.longest',
    vars: { sec: s.longest.toFixed(1) },
  });
  if (d.body.available && finite(video?.motionAvg) && video.motionAvg < L.motion * 0.7) out.push({
    dim: 'body', lost: lost('body'), key: 'tip.motion',
    vars: { motion: video.motionAvg.toFixed(1) },
  });
  return out.sort((a, b) => b.lost - a.lost);
}
