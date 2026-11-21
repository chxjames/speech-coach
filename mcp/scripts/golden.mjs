#!/usr/bin/env node
// 用样本测量值（test/fixtures/en-samples.json）跑一遍所有 形态 × 场景 × 水平，
// 把分数写进 test/fixtures/golden-scores.json。golden 测试拿它对比。
//
// 只有在有意改了评分标准、并且升了 RUBRIC_VERSION 之后才重新生成：
//   node scripts/golden.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { goldenScores } from '../test/golden-lib.js';

const here = new URL('../test/fixtures/', import.meta.url);
const samples = JSON.parse(readFileSync(new URL('en-samples.json', here), 'utf8'));
const golden = goldenScores(samples);
writeFileSync(new URL('golden-scores.json', here), JSON.stringify(golden, null, 1) + '\n');
console.log(`wrote ${Object.keys(golden.scores).length} configs for rubric ${golden.rubric}`);
