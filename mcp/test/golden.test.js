import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUBRIC_VERSION, REFERENCE_MODEL } from '../src/score.js';
import { goldenScores } from './golden-lib.js';

const read = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const samples = read('en-samples.json');
const golden = read('golden-scores.json');

test('golden scores were made for this rubric version and reference model', () => {
  // 改了公式/权重/目标值：先升 RUBRIC_VERSION，再 node scripts/golden.mjs 重新生成。
  assert.equal(golden.rubric, RUBRIC_VERSION);
  assert.equal(golden.model, REFERENCE_MODEL);
  assert.equal(samples.model, REFERENCE_MODEL);
});

test('scores on the 18 English reference samples have not drifted', () => {
  const now = goldenScores(samples).scores;
  assert.deepEqual(Object.keys(now).sort(), Object.keys(golden.scores).sort());
  const drift = [];
  for (const [cfg, row] of Object.entries(golden.scores)) {
    for (const [id, want] of Object.entries(row)) {
      const got = now[cfg][id];
      want.forEach((w, i) => {
        if ((w == null) !== (got[i] == null) || (w != null && Math.abs(w - got[i]) > 1e-3)) drift.push(`${cfg} ${id}[${i}] ${w} -> ${got[i]}`);
      });
    }
  }
  assert.equal(drift.length, 0, `scores changed without a rubric version bump:\n${drift.slice(0, 10).join('\n')}`);
});
