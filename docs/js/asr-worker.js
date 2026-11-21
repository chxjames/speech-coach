// 一个 Worker = 一份 Whisper 模型，负责把一段 16k 音频转成词级时间戳。
// 池子由 asr.js 管理；这里只管"加载"和"转一段"。

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

env.allowLocalModels = false;
env.useBrowserCache = true;

let asr = null;
let modelId = null;

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      modelId = msg.model;
      asr = await pipeline('automatic-speech-recognition', modelId, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (p) => {
          if (p && p.status === 'progress' && p.file && p.total) {
            self.postMessage({ type: 'load', file: p.file, loaded: p.loaded, total: p.total });
          }
        },
      });
      self.postMessage({ type: 'ready' });
      return;
    }

    if (msg.type === 'transcribe') {
      const { id, offset, samples } = msg;
      const opts = { return_timestamps: 'word', chunk_length_s: 30 };
      if (modelId && !/\.en$/.test(modelId) && msg.language) opts.language = msg.language;

      const res = await asr(samples, opts);
      const words = (res.chunks || [])
        .map(c => {
          const ts = c.timestamp || [null, null];
          return {
            text: (c.text || '').trim(),
            start: ts[0] == null ? null : ts[0] + offset,
            end: ts[1] == null ? null : ts[1] + offset,
          };
        })
        .filter(w => w.text && w.start != null);

      self.postMessage({ type: 'result', id, text: res.text || '', words });
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg && msg.id, message: String(err && err.message || err) });
  }
};
