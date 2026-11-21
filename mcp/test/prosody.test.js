import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeProsody } from '../src/prosody.js';

const SR = 16000;

// 拼一段合成音频：每段 { sec, f0 } 是一个带谐波的元音，f0 = 0 是静音，f0 = 'noise' 是清音噪声。
function synth(parts) {
  const total = parts.reduce((a, p) => a + p.sec, 0);
  const x = new Float32Array(Math.round(total * SR));
  let off = 0, phase = 0, seed = 1;
  for (const p of parts) {
    const n = Math.round(p.sec * SR);
    for (let i = 0; i < n; i++) {
      let v = 0;
      if (p.f0 === 'noise') {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        v = (seed / 0x7fffffff - 0.5) * 0.4;
      } else if (p.f0 > 0) {
        phase += 2 * Math.PI * p.f0 / SR;
        v = 0.3 * Math.sin(phase) + 0.15 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase);
      }
      x[off + i] = v;
    }
    off += n;
  }
  return x;
}

// 在 [start, end) 里每 0.25 秒放一个词
function wordsIn(start, end) {
  const out = [];
  for (let t = start; t < end - 0.2; t += 0.25) out.push({ text: 'word', start: t, end: t + 0.2 });
  return out;
}

  test(`a sentence with no pitch does not inflate segSdSt`, () => {
    // 三句同音高的元音 + 一句清音噪声（测不到音高）。音高没变化，句间标准差应接近 0。
    const x = synth([
      { sec: 1.5, f0: 110 }, { sec: 1, f0: 0 },
      { sec: 1.5, f0: 110 }, { sec: 1, f0: 0 },
      { sec: 1.5, f0: 'noise' }, { sec: 1, f0: 0 },
      { sec: 1.5, f0: 110 }, { sec: 0.5, f0: 0 },
    ]);
    const words = [...wordsIn(0, 1.5), ...wordsIn(2.5, 4), ...wordsIn(5, 6.5), ...wordsIn(7.5, 9)];
    const r = analyzeProsody(x, words);
    assert.ok(r.segments.some(s => s.medianPitch == null), 'the noise sentence should have no pitch');
    assert.ok(r.summary.segSdSt < 1, `segSdSt = ${r.summary.segSdSt}`);
  });

  test(`an octave error on the very first frames does not discard the whole track`, () => {
    // 开头 0.12 秒是倍频，后面是正常音高。以前以第一帧为参照，后面的帧全被判成八度错误。
    const x = synth([
      { sec: 0.3, f0: 0 }, { sec: 0.12, f0: 230 }, { sec: 3, f0: 110 }, { sec: 0.5, f0: 0 },
    ]);
    const r = analyzeProsody(x, wordsIn(0.3, 3.4));
    assert.ok(Number.isFinite(r.summary.rangeSt), `rangeSt = ${r.summary.rangeSt}`);
    assert.ok(r.summary.rangeSt < 2, `rangeSt = ${r.summary.rangeSt}`);
  });

  test(`frames flagged as octave errors are not read as 0 in the sentence-final slope`, () => {
    // 平调的句子，句尾夹一小段倍频。倍频帧被剔除后，句尾应判为平，而不是被 0 拉成下坠。
    const x = synth([
      { sec: 0.3, f0: 0 }, { sec: 2, f0: 110 }, { sec: 0.2, f0: 290 }, { sec: 0.1, f0: 110 },
      { sec: 1, f0: 0 },
    ]);
    const r = analyzeProsody(x, wordsIn(0.3, 2.6));
    assert.equal(r.segments.length, 1);
    const slope = r.segments[0].finalSlope;
    assert.ok(slope != null && Math.abs(slope) <= 0.5, `finalSlope = ${slope}`);
  });

test('web and MCP prosody engines are the same code', () => {
  // 网页版 import SR 自 audio.js（它会拉进 DOM 代码，Node 里跑不了），MCP 版自己定义 SR。
  // 除了这一行，两份必须一字不差。
  const strip = (f) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    .split('\n').filter(l => !/^(import \{ SR \}|export const SR)/.test(l)).join('\n');
  assert.equal(strip('../src/prosody.js'), strip('../../docs/js/prosody.js'));
});
