#!/usr/bin/env node
// 同一批样本用两个模型量过时，比较它们在当前评分标准下的总分差多少。
// 用来回答"网页版用 small.en、参考模型是 turbo，分数会偏多少"。
//   node scripts/model-delta.mjs test/fixtures/en-samples.json test/fixtures/en-samples-small.en.json
import { readFileSync } from 'node:fs';
import { score, FORMATS, SCENES, LEVELS } from '../src/score.js';

const [fa, fb] = process.argv.slice(2);
const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'));
const byId = Object.fromEntries(B.samples.map((s) => [s.id, s]));
const diffs = [], rows = [];
for (const format of Object.keys(FORMATS)) for (const scene of Object.keys(SCENES)) for (const level of Object.keys(LEVELS)) {
  for (const a of A.samples) {
    const b = byId[a.id]; if (!b) continue;
    const ra = score({ s: a.summary, video: a.video, format, scene, level, manual: {} });
    const rb = score({ s: b.summary, video: b.video, format, scene, level, manual: {} });
    if (ra.total == null || rb.total == null) continue;
    // 用百分比比较，两边的满分可能不同（静音判定不一样时）
    const d = (rb.total / rb.totalMax - ra.total / ra.totalMax) * 100;
    diffs.push(Math.abs(d)); rows.push({ cfg: `${format}/${scene}/${level}`, id: a.id, d });
  }
}
diffs.sort((x, y) => x - y);
const q = (p) => diffs[Math.min(diffs.length - 1, Math.floor(diffs.length * p))].toFixed(2);
console.log(`${B.model} vs ${A.model}: ${diffs.length} scores`);
console.log(`|total difference| in points per 100: median ${q(0.5)}, p90 ${q(0.9)}, max ${q(1)}`);
const worst = rows.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 6);
for (const w of worst) console.log(`  ${w.cfg.padEnd(26)} ${w.id.padEnd(16)} ${w.d >= 0 ? '+' : ''}${w.d.toFixed(2)}`);
const per = {};
for (const r of rows) (per[r.id] ||= []).push(r.d);
console.log('mean difference per sample:', Object.entries(per).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(' | '));
