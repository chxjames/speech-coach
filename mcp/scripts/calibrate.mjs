#!/usr/bin/env node
// 读 measure-samples.mjs 量出来的样本，打印 3MT 获奖者的指标分布和每个样本的得分。
// 用来校准 stage 目标值、检查获奖者有没有被不合理地扣分。只读，不改任何文件。
//
//   node scripts/calibrate.mjs test/fixtures/en-samples.json
import { readFileSync } from 'node:fs';
import { score, findings } from '../src/score.js';

const data = JSON.parse(readFileSync(process.argv[2] || 'test/fixtures/en-samples.json', 'utf8'));
const q = (arr, p) => { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');

const win = data.samples.filter((s) => s.group === '3mt');
const rows = [
  ['wpm', (s) => s.summary.wpm, 0], ['articWpm', (s) => s.summary.articWpm, 0],
  ['pauseAvg', (s) => s.summary.pauseAvg, 2], ['pauses/min', (s) => s.summary.pauses / (s.durationSec / 60), 1],
  ['longest', (s) => s.summary.longest, 1], ['rangeSt', (s) => s.summary.rangeSt, 1],
  ['segSdSt', (s) => s.summary.segSdSt, 2],
  ['riseShare', (s) => { const f = s.summary.finals; return f.rising / (f.rising + f.flat + f.falling || 1); }, 2],
  ['fallShare', (s) => { const f = s.summary.finals; return f.falling / (f.rising + f.flat + f.falling || 1); }, 2],
  ['fillerRate', (s) => s.summary.fillerRate, 2], ['motion', (s) => s.video?.motionAvg, 1],
];
console.log(`model ${data.model} · 3MT winners n=${win.length}\n`);
console.log('metric       p10     p25  median     p75     p90');
for (const [name, get, d] of rows) {
  const v = win.map(get);
  console.log(name.padEnd(11), [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => fmt(q(v, p), d).padStart(7)).join(' '));
}

const configs = [['stage', 'contest', 'solid'], ['stage', 'contest', 'pro'], ['desk', 'final', 'solid']];
for (const [format, scene, level] of configs) {
  console.log(`\n== ${format} / ${scene} / ${level}  (pacing, prosody, clarity as % of max; total over measured)`);
  for (const s of data.samples) {
    const r = score({ s: s.summary, video: s.video, format, scene, level, manual: {} });
    const pct = (k) => (r.dims[k].available ? Math.round(r.dims[k].got / r.dims[k].max * 100) : '–');
    const auto = ['pacing', 'prosody', 'clarity'].reduce((a, k) => a + r.dims[k].got, 0)
      / ['pacing', 'prosody', 'clarity'].reduce((a, k) => a + r.dims[k].max, 0);
    const tips = findings({ s: s.summary, video: s.video, scored: r, format, scene, level }).map((t) => t.key.replace('tip.', ''));
    console.log(`${s.group.padEnd(5)} ${s.id.padEnd(16)} pace ${String(pct('pacing')).padStart(3)}  pros ${String(pct('prosody')).padStart(3)}  clar ${String(pct('clarity')).padStart(3)}  body ${String(pct('body')).padStart(3)}  voice ${Math.round(auto * 100)}%  ${tips.join(',')}`);
  }
}
