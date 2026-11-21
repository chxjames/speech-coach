// golden 分数的生成方式，测试和 scripts/golden.mjs 共用，保证两边算法一致。
import { score, FORMATS, SCENES, LEVELS, RUBRIC_VERSION } from '../src/score.js';

const DIMS = ['content', 'pacing', 'prosody', 'clarity', 'body', 'production'];
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);

export function goldenScores(samples) {
  const scores = {};
  for (const format of Object.keys(FORMATS)) {
    for (const scene of Object.keys(SCENES)) {
      for (const level of Object.keys(LEVELS)) {
        const row = {};
        for (const s of samples.samples) {
          const r = score({ s: s.summary, video: s.video, format, scene, level, manual: {} });
          // [总分, 满分, 六维得分...]
          row[s.id] = [r4(r.total), r4(r.totalMax), ...DIMS.map((k) => r4(r.dims[k].got))];
        }
        scores[`${format}/${scene}/${level}`] = row;
      }
    }
  }
  return { rubric: RUBRIC_VERSION, model: samples.model, scores };
}
