// Whisper（transformers.js，ONNX）在 Node 里跑词级识别。
// 30 秒一块、块间 2 秒重叠；接缝处同一个词会被听两次，用"文本 + 0.5 秒时间桶"去重。
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;

const OVERLAP = 2;
let asrPromise = null;
let asrModel = null;

export async function loadModel(model) {
  if (asrModel === model && asrPromise) return asrPromise;
  asrModel = model;
  asrPromise = pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    progress_callback: () => {},
  });
  return asrPromise;
}

export async function transcribe(samples, {
  model = 'Xenova/whisper-base.en',
  language = 'en',
  chunkSeconds = 30,
  onProgress = () => {},
} = {}) {
  const asr = await loadModel(model);
  const SR = 16000;

  const chunks = [];
  const stride = Math.max(1, chunkSeconds - OVERLAP) * SR;
  const size = Math.ceil(chunkSeconds * SR);
  for (let off = 0; off < samples.length; off += stride) {
    chunks.push({ offset: off / SR, samples: samples.slice(off, off + size) });
    if (off + size >= samples.length) break;
  }
  if (!chunks.length) chunks.push({ offset: 0, samples });

  const words = [];
  const texts = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const opts = { return_timestamps: 'word', chunk_length_s: 30 };
    if (!/\.en$/.test(model)) opts.language = language;
    const res = await asr(c.samples, opts);
    for (const ch of res.chunks || []) {
      const ts = ch.timestamp || [null, null];
      const text = (ch.text || '').trim();
      if (!text || ts[0] == null) continue;
      words.push({ text, start: ts[0] + c.offset, end: (ts[1] ?? ts[0]) + c.offset });
    }
    texts.push((res.text || '').trim());
    onProgress({ done: i + 1, total: chunks.length });
  }

  dedupeWords(words);
  return { words, text: texts.join(' ') };
}

function dedupeWords(words) {
  words.sort((a, b) => a.start - b.start);
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const norm = w.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
    if (!norm) { out.push(w); continue; }
    const bucket = Math.round(w.start * 2);
    let dup = false;
    for (let d = -1; d <= 1 && !dup; d++) if (seen.has(`${norm}@${bucket + d}`)) dup = true;
    if (dup) continue;
    seen.add(`${norm}@${bucket}`);
    out.push(w);
  }
  words.length = 0;
  words.push(...out);
}
