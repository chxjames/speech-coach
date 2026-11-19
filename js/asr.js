// Whisper 的 Worker 池：同时跑 N 段，按顺序把结果拼起来。
// 注意：每个 Worker 各持有一份模型（small 约 250MB），所以并行数不要开太大。
import { t } from './i18n.js';

import { chunkAudio } from './audio.js';

export async function transcribe(samples, {
  model = 'Xenova/whisper-small.en',
  language = 'en',
  workers = 4,
  chunkSeconds = 30,
  onProgress = () => {},
} = {}) {
  const chunks = chunkAudio(samples, chunkSeconds);
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
  dedupeWords(words, chunkSeconds);

  return { words, text: texts.join(' '), chunks };
}

// 分块的接缝处可能重复一个词，去掉时间上重叠且内容相同的相邻重复。
function dedupeWords(words, chunkSeconds) {
  words.sort((a, b) => a.start - b.start);
  for (let i = words.length - 1; i > 0; i--) {
    const a = words[i - 1], b = words[i];
    if (!a.text || !b.text) continue;
    const same = a.text.toLowerCase().replace(/[^\w']/g, '') === b.text.toLowerCase().replace(/[^\w']/g, '');
    if (same && Math.abs(a.start - b.start) < 0.35) words.splice(i, 1);
  }
}
