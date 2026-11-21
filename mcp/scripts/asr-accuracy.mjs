#!/usr/bin/env node
// 比较几种转写配置和参考转写（faster-whisper large-v3）的一致程度：词错率 WER、词数比、耗时。
// 结果一行一行追加到 out.jsonl，可以断点续跑。
//
//   node scripts/asr-accuracy.mjs out.jsonl <config> <ref.json:video.mp4> ...
//   config: small-q8 | small-fp32 | medium-q8 | turbo-q8
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { decodeToMono16k } from '../src/audio.js';
import { transcribe } from '../src/asr.js';

const CONFIGS = {
  'small-q8': { model: 'Xenova/whisper-small.en', dtype: 'q8' },
  'small-fp32': { model: 'Xenova/whisper-small.en', dtype: 'fp32' },
  'medium-q8': { model: 'Xenova/whisper-medium.en', dtype: 'q8' },
  'turbo-q8': { model: 'onnx-community/whisper-large-v3-turbo_timestamped', dtype: 'q8', language: 'english' },
};

export const normWords = (text) => text.toLowerCase()
  .replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, ' ')
  .split(/\s+/).filter(Boolean);

export function wer(ref, hyp) {
  const n = ref.length, m = hyp.length;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[m] / Math.max(1, n);
}

const [out, cfgName, ...pairs] = process.argv.slice(2);
const cfg = CONFIGS[cfgName];
if (!out || !cfg || !pairs.length) { console.error('usage: asr-accuracy.mjs out.jsonl <config> <ref.json:video.mp4> ...'); process.exit(1); }
const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.config}|${r.id}`; }) : []);

for (const pair of pairs) {
  const k = pair.lastIndexOf('.json:');
  const refFile = pair.slice(0, k + 5), video = pair.slice(k + 6);
  const id = basename(video, extname(video));
  if (done.has(`${cfgName}|${id}`)) continue;
  const ref = normWords(JSON.parse(readFileSync(refFile, 'utf8')).text);
  const { samples } = await decodeToMono16k(video);
  const t0 = Date.now();
  const { words } = await transcribe(samples, { model: cfg.model, dtype: cfg.dtype, language: cfg.language });
  const sec = (Date.now() - t0) / 1000;
  const hyp = normWords(words.map((w) => w.text).join(' '));
  const row = { config: cfgName, id, audioSec: +(samples.length / 16000).toFixed(1), sec: +sec.toFixed(1),
    refWords: ref.length, words: hyp.length, wordRatio: +(hyp.length / ref.length).toFixed(3), wer: +wer(ref, hyp).toFixed(4) };
  appendFileSync(out, JSON.stringify(row) + '\n');
  console.error(JSON.stringify(row));
}
