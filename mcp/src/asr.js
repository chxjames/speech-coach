// Whisper（transformers.js，ONNX）在 Node 里跑词级识别。
// 30 秒一块、块间 2 秒重叠；接缝处同一个词会被听两次，用"文本 + 0.5 秒时间桶"去重。
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;

const OVERLAP = 2;
let asrPromise = null;
let asrKey = null;

// dtype：'q8'（默认，8 位量化）或 'fp32' 等；也可以是 { encoder_model, decoder_model_merged } 分别指定。
export async function loadModel(model, dtype = 'q8') {
  const key = `${model}|${JSON.stringify(dtype)}`;
  if (asrKey === key && asrPromise) return asrPromise;
  asrKey = key;
  asrPromise = pipeline('automatic-speech-recognition', model, {
    dtype,
    progress_callback: () => {},
  });
  return asrPromise;
}

// .en 模型只认英文，不接受 language。多语言模型要明确传语言：transformers.js 不做语言识别，
// 不传就默认英文，非英语录音会被翻译成英文而不是转写。
export function asrOptions(model, language) {
  const opts = { return_timestamps: 'word', chunk_length_s: 30 };
  if (!/\.en$/i.test(model) && language) opts.language = language;
  return opts;
}

export async function transcribe(samples, {
  model = 'Xenova/whisper-small.en',
  // 录音里说的语言（'chinese'、'zh' 都行）。多语言模型必须明确给：transformers.js 不会自动识别，
  // 不给就按英文处理，中文录音会被直接翻译成英文。.en 模型只认英文，忽略这个参数。
  language = null,
  dtype = 'q8',
  chunkSeconds = 30,
  onProgress = () => {},
} = {}) {
  const asr = await loadModel(model, dtype);
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
    const res = await asr(c.samples, asrOptions(model, language));
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
