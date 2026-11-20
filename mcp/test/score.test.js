import test from 'node:test';
import assert from 'node:assert/strict';
import * as mcp from '../src/score.js';
import * as web from '../../docs/js/score.js';
import { buildReport } from '../src/report.js';

const goodS = () => ({
  words: 300,
  speechSec: 120,
  wpm: 155,
  pauseAvg: 0.85,
  pauses: 20,
  pauseMax: 1.5,
  longest: 10,
  rangeSt: 10,
  segSdSt: 2,
  finals: { falling: 12, flat: 5, rising: 3 },
  articWpm: 185,
  fillerRate: 1.5,
  fillers: 5,
  medianPitch: 120,
  text: 'test transcript',
  segments: [],
});

const goodVideo = () => ({
  width: 1280,
  height: 720,
  motionAvg: 8,
  bitrateKbps: 2000,
  lumaMedian: 115,
});

const input = (over = {}) => ({
  s: goodS(),
  video: goodVideo(),
  format: 'stage',
  scene: 'contest',
  level: 'solid',
  manual: { content: 24, composition: 10 },
  ...over,
});

test('format aliases', () => {
  assert.equal(mcp.normalizeFormat('stage'), 'stage');
  assert.equal(mcp.normalizeFormat('desk'), 'desk');
  assert.equal(mcp.normalizeFormat('camera'), 'desk');
  assert.equal(mcp.normalizeFormat(''), 'desk');
  assert.equal(mcp.normalizeFormat(null), 'desk');
});

test('weights sum to 100 for every format and scene', () => {
  for (const format of Object.keys(mcp.FORMATS)) {
    for (const scene of Object.keys(mcp.SCENES)) {
      const w = mcp.weightsFor(format, scene);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 100) < 0.11, `${format}/${scene} sums to ${sum}`);
    }
  }
});

test('stage contest targets keep the stage base', () => {
  const t = mcp.targetsFor('stage', 'contest', 'solid');
  assert.equal(t.rate[0], 160);
  assert.equal(t.pause[0], 0.7);
  assert.equal(t.longMax, 10);
  assert.equal(t.range[0], 9.5);
  assert.equal(t.sd[0], 1.9);
  assert.equal(t.artic[0], 190);
  assert.equal(t.filler[0], 1.5);
  assert.equal(t.motion, 8);
});

test('desk contest targets keep the desk base', () => {
  const t = mcp.targetsFor('desk', 'contest', 'solid');
  assert.equal(t.rate[0], 170);
  assert.equal(t.pause[0], 0.45);
  assert.equal(t.longMax, 8);
  assert.equal(t.range[0], 7.5);
  assert.ok(Math.abs(t.sd[0] - 1.6) < 1e-9);
  assert.equal(t.artic[0], 200);
  assert.equal(t.motion, 4);
});

test('complete score has all dimensions and totalMax 100', () => {
  const r = mcp.score(input());
  assert.equal(r.coreComplete, true);
  assert.equal(r.complete, true);
  assert.ok(Math.abs(r.totalMax - 100) < 1e-9, `totalMax ${r.totalMax}`);
  assert.ok(r.total > 0 && r.total <= 100);
  assert.ok(Math.abs(r.coverage - 1) < 1e-9, `coverage ${r.coverage}`);
  for (const d of Object.values(r.dims)) assert.equal(d.available, true);
});

test('no video keeps the core total and lowers totalMax', () => {
  const r = mcp.score(input({ video: null }));
  assert.equal(r.coreComplete, true);
  assert.equal(r.complete, false);
  assert.ok(Number.isFinite(r.total));
  assert.ok(r.totalMax > 79 && r.totalMax < 82, `totalMax ${r.totalMax}`);
  assert.ok(r.coverage > 0.79 && r.coverage < 0.82);
  assert.equal(r.dims.body.available, false);
  assert.equal(r.dims.body.reason, 'no-video');
  assert.equal(r.dims.production.available, false);
  const sumMax = Object.values(r.dims).filter((d) => d.available).reduce((a, d) => a + d.max, 0);
  assert.ok(Math.abs(r.totalMax - sumMax) < 1e-9);
});

test('no audio means no total, even with video', () => {
  const r = mcp.score(input({ s: null }));
  assert.equal(r.coreComplete, false);
  assert.equal(r.total, null);
  assert.equal(r.totalMax, null);
  assert.equal(r.coverage, 0);
  assert.equal(r.dims.pacing.reason, 'no-audio');
  assert.equal(r.dims.prosody.reason, 'no-pitch');
  assert.equal(r.dims.clarity.reason, 'no-audio');
  assert.equal(r.dims.body.available, true);
  assert.equal(r.dims.production.available, true);
});

test('camera is the old name for desk', () => {
  const a = mcp.score(input({ format: 'camera' }));
  const b = mcp.score(input({ format: 'desk' }));
  assert.equal(a.format, 'desk');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('manual content is not rescaled twice', () => {
  const r = mcp.score(input({ manual: { content: 20 } }));
  assert.equal(r.dims.content.manual, true);
  assert.equal(r.dims.content.estimated, false);
  assert.equal(r.dims.content.got, 20);
});

test('missing manual content is marked estimated', () => {
  const r = mcp.score(input({ manual: {} }));
  assert.equal(r.dims.content.estimated, true);
  assert.equal(r.dims.content.reason, 'estimated');
});

test('findings skip unavailable dimensions', () => {
  const scored = mcp.score(input({ s: null, video: null }));
  assert.deepEqual(mcp.findings({ s: null, video: null, scored }), []);
});

test('web and MCP score engines agree', () => {
  assert.equal(JSON.stringify(web.score(input())), JSON.stringify(mcp.score(input())));
  assert.deepEqual(web.targetsFor('desk', 'interview', 'starter'), mcp.targetsFor('desk', 'interview', 'starter'));
});

test('report survives a missing audio track', () => {
  const scored = mcp.score({ s: null, video: goodVideo(), format: 'desk', scene: 'final', level: 'solid' });
  const text = buildReport({ name: 'no-audio.mp4', s: null, video: goodVideo(), scored, findings: [], lang: 'en' });
  assert.match(text, /No audio metrics were measured/);
  assert.match(text, /no total this time/);
});

test('report survives a missing picture', () => {
  const scored = mcp.score({ s: goodS(), video: null, format: 'desk', scene: 'final', level: 'solid' });
  const text = buildReport({ name: 'no-video.mp4', s: goodS(), video: null, scored, findings: [], lang: 'en' });
  assert.match(text, /Coverage 76%/);
  assert.match(text, /\| Camera motion \| – \| – \|/);
});
