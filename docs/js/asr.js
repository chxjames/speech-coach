// Whisper 的 Worker 池：同时跑 N 段，按顺序把结果拼起来。
// 注意：每个 Worker 各持有一份模型（small 约 250MB），所以并行数不要开太大。
import { t } from './i18n.js';

import { chunkAudio, SR } from './audio.js';

const OVERLAP = 2;   // 秒。接缝处多听 2 秒，避免一个词被切在两段中间（会让语速和停顿都失真）

export async function transcribe(samples, {
  model = 'Xenova/whisper-small.en',
  // 录音里说的语言（'chinese'、'zh' 都行）。多语言模型必须明确给：transformers.js 不会自动识别，
  // 不给就按英文处理，中文录音会被直接翻译成英文。.en 模型只认英文，忽略这个参数。
  language = null,
  workers = 4,
  chunkSeconds = 30,
  onProgress = () => {},
} = {}) {
  const chunks = [];
  const stride = Math.max(1, chunkSeconds - OVERLAP) * SR;
  const size = Math.ceil(chunkSeconds * SR);
  for (let off = 0; off < samples.length; off += stride) {
    chunks.push({ offset: off / SR, samples: samples.slice(off, off + size) });
    if (off + size >= samples.length) break;
  }
  if (!chunks.length) chunks.push({ offset: 0, samples });
  const n = Math.max(1, Math.min(workers, chunks.length));
  onProgress({ stage: 'load', done: 0, total: chunks.length, msg: t('progress.workers', { n }) });

  const pool = [];
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('./asr-worker.js', import.meta.url), { type: 'module' });
    pool.push(w);
  }

  // 初始化：把模型加载分摊到所有 worker 上并行进行
  let loaded = 0;
  await Promise.all(pool.map(w => new Promise((resolve, reject) => {
    const onMsg = (e) => {
      const m = e.data;
      if (m.type === 'ready') {
        w.removeEventListener('message', onMsg);
        loaded++;
        onProgress({ stage: 'load', done: loaded / n, total: 1, msg: t('progress.loaded', { n: `${loaded}/${n}` }) });
        resolve();
      } else if (m.type === 'load') {
        onProgress({ stage: 'load', done: null, total: 1, msg: t('progress.download', { pct: Math.round((m.loaded / m.total) * 100), file: m.file }) });
      } else if (m.type === 'error') {
        w.removeEventListener('message', onMsg);
        reject(new Error(m.message));
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ type: 'init', model });
  })));

  // 派活
  const results = new Array(chunks.length).fill(null);
  let next = 0;
  let done = 0;

  async function drain(w) {
    while (next < chunks.length) {
      const idx = next++;
      const c = chunks[idx];
      const res = await new Promise((resolve, reject) => {
        const onMsg = (e) => {
          const m = e.data;
          if (m.type === 'result' && m.id === idx) {
            w.removeEventListener('message', onMsg);
            resolve(m);
          } else if (m.type === 'error' && m.id === idx) {
            w.removeEventListener('message', onMsg);
            reject(new Error(m.message));
          }
        };
        w.addEventListener('message', onMsg);
        w.postMessage({ type: 'transcribe', id: idx, offset: c.offset, samples: c.samples, language });
      });
      results[idx] = res;
      done++;
      onProgress({ stage: 'asr', done, total: chunks.length, msg: t('progress.asr', { done, total: chunks.length }) });
    }
  }

  try {
    await Promise.all(pool.map(drain));
  } finally {
    pool.forEach(w => w.terminate());
  }

  const words = [];
  const texts = [];
  for (const r of results) {
    if (!r) continue;
    words.push(...r.words);
    texts.push(r.text.trim());
  }
  // 分块有 2 秒重叠，接缝处同一个词会被两段各听一次 → 按"归一化文本 + 0.5 秒时间桶"去重
  dedupeWords(words);

  return { words, text: texts.join(' '), chunks };
}

// 重叠区里的重复词：文本相同、起始时间靠近（相差不到 1 个时间桶）就只留一个。
function dedupeWords(words) {
  words.sort((a, b) => a.start - b.start);
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const norm = (w.text || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
    if (!norm) { out.push(w); continue; }
    const bucket = Math.round(w.start * 2); // 0.5s 一格
    let dup = false;
    for (let d = -1; d <= 1 && !dup; d++) if (seen.has(`${norm}@${bucket + d}`)) dup = true;
    if (dup) continue;
    seen.add(`${norm}@${bucket}`);
    out.push(w);
  }
  words.length = 0;
  words.push(...out);
}
