#!/usr/bin/env node
// 用发布出去的同一套引擎（ffmpeg → Whisper → prosody.js / video.js）量一批样本，
// 只存测量值，不存打分：打分由 score.js 现算，这样改公式时 golden 测试能看出差异。
//
//   node scripts/measure-samples.mjs out.json <group>=<file> [<group>=<file> ...]
//
// 视频本身不进仓库（大多是网上的演讲），进仓库的只有测量值。
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { decodeToMono16k } from '../src/audio.js';
import { transcribe } from '../src/asr.js';
import { analyzeProsody } from '../src/prosody.js';
import { analyzeVideo } from '../src/video.js';
import { REFERENCE_MODEL } from '../src/score.js';

const [out, ...items] = process.argv.slice(2);
if (!out || !items.length) {
  console.error('usage: measure-samples.mjs out.json <group>=<file> ...');
  process.exit(1);
}

const round = (x, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);
const roundAll = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? round(v) : v)));

// 断点续跑：已经量过的样本直接跳过
const done = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { model: REFERENCE_MODEL, samples: [] };
const have = new Set(done.samples.map((s) => s.id));

for (const item of items) {
  const i = item.indexOf('=');
  const group = item.slice(0, i), file = item.slice(i + 1);
  const id = basename(file, extname(file));
  if (have.has(id)) { console.error(`skip ${id}`); continue; }
  const t0 = Date.now();
  const { samples } = await decodeToMono16k(file);
  const { words } = await transcribe(samples, { model: REFERENCE_MODEL });
  const p = analyzeProsody(samples, words);
  let video = null;
  try { video = await analyzeVideo(file); } catch (e) { console.error(`  video probe failed: ${e.message}`); }
  const { segments, ...summary } = p.summary;
  done.samples.push(roundAll({
    id, group,
    durationSec: samples.length / 16000,
    summary: { ...summary, segments },
    video: video && {
      width: video.width, height: video.height, bitrateKbps: video.bitrateKbps,
      lumaMedian: video.lumaMedian, motionAvg: video.motionAvg,
    },
  }));
  writeFileSync(out, JSON.stringify(done, null, 1) + '\n');
  console.error(`${id}  ${((Date.now() - t0) / 1000).toFixed(0)}s  words=${summary.words} wpm=${round(summary.wpm, 0)} pause=${round(summary.pauseAvg, 2)}`);
}
