// 生成 markdown 报告。和网页版 js/report.js 同一套结构，只是从 t() 取文案。
import { t } from './i18n.js';

export const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const r = Math.floor(sec % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

const DIM_ORDER = ['content', 'pacing', 'prosody', 'clarity', 'body', 'production'];

const bar = (v, max, width = 10) => {
  const n = max > 0 ? Math.round(Math.max(0, Math.min(1, v / max)) * width) : 0;
  return '█'.repeat(n) + '·'.repeat(width - n);
};

export function buildReport({ name, s, m, video, scored, findings, lang = 'en' }) {
  const T = (k, v) => t(k, v, lang);
  const L = lang;
  const lines = [];

  lines.push(T('title', { name: name || T('untitled') }));
  lines.push('');
  lines.push(T('total', {
    total: scored.total.toFixed(1),
    scene: T('scene.' + scored.scene),
    profile: T('profile.' + scored.profile),
    level: T('level.' + scored.level),
  }));
  lines.push('');

  // 六维
  lines.push(T('dims'));
  lines.push('');
  lines.push(`| ${T('th.dim')} | ${T('th.score')} | ${T('th.scale')} |`);
  lines.push('| --- | --- | --- |');
  for (const k of DIM_ORDER) {
    const d = scored.dims[k];
    lines.push(`| ${T('dim.' + k)} | ${d.got.toFixed(1)} / ${d.max} | \`${bar(d.got, d.max)}\` |`);
  }
  lines.push('');

  // 硬指标
  lines.push(T('metrics'));
  lines.push('');
  lines.push(T('words', { words: s.words, sec: s.speechSec.toFixed(1) }));
  lines.push(T('rate', { wpm: Math.round(s.wpm), artic: Math.round(s.articWpm) }));
  lines.push(T('pause', { n: s.pauses, avg: s.pauseAvg.toFixed(2), max: s.pauseMax.toFixed(1) }));
  lines.push(T('longest', { sec: s.longest.toFixed(1) }));
  lines.push(T('pitch', {
    hz: s.medianPitch ? T('hz', { v: Math.round(s.medianPitch) }) : '—',
    range: T('st', { v: s.rangeSt != null ? s.rangeSt.toFixed(1) : '—' }),
    sd: s.segSdSt != null ? T('st', { v: s.segSdSt.toFixed(2) }) : '—',
  }));
  lines.push(T('finals', { fall: s.finals.falling, flat: s.finals.flat, rise: s.finals.rising }));
  lines.push(T('fillers', { n: s.fillers, rate: s.fillerRate.toFixed(1) }));
  if (video?.width) {
    lines.push(T('video', {
      w: video.width, h: video.height, kbps: Math.round(video.bitrateKbps || 0),
      luma: Math.round(video.lumaMedian || 0), motion: (video.motionAvg || 0).toFixed(1),
    }));
  }
  lines.push('');

  // 建议
  if (findings.length) {
    lines.push(T('tips'));
    lines.push('');
    findings.forEach((f, i) => {
      lines.push(`${i + 1}. **${T(f.key, f.vars)}** (${T('tip.cost', { x: f.lost.toFixed(1) })})`);
    });
    lines.push('');
  }

  // 逐句
  if (s.segments?.length) {
    lines.push(T('segs'));
    lines.push('');
    lines.push(`| ${T('th.time')} | ${T('th.text')} | ${T('th.dur')} | ${T('th.pitch')} | ${T('th.ending')} |`);
    lines.push('| --- | --- | --- | --- | --- |');
    for (const seg of s.segments) {
      const end = seg.finalSlope == null ? '—'
        : seg.finalSlope < -0.5 ? T('dir.fall')
        : seg.finalSlope > 0.5 ? T('dir.rise')
        : T('dir.flat');
      lines.push(`| ${fmtTime(seg.start)} | ${seg.text.replace(/\|/g, '\\|')} | ${seg.dur.toFixed(1)}s | ${seg.medianPitch ? Math.round(seg.medianPitch) : '—'} | ${end} |`);
    }
    lines.push('');
  }

  // 文字稿
  if (s.text) {
    lines.push(T('transcript'));
    lines.push('');
    lines.push('```');
    lines.push(s.text);
    lines.push('```');
    lines.push('');
  }

  lines.push(T('note'));
  lines.push('');

  // 总结
  lines.push(T('sum.title'));
  lines.push('');
  const total = scored.total;
  const verdict = total >= 85 ? 'high' : total >= 70 ? 'solid' : total >= 55 ? 'mid' : 'low';
  lines.push(`- ${T('sum.verdict.' + verdict)}`);

  const best = DIM_ORDER
    .map((k) => ({ k, share: scored.dims[k].got / scored.dims[k].max }))
    .sort((a, b) => b.share - a.share)[0];
  lines.push(`- ${T('sum.keep', {
    dim: T('dim.' + best.k),
    got: scored.dims[best.k].got.toFixed(1),
    max: scored.dims[best.k].max,
  })}`);

  if (findings.length) {
    lines.push(`- ${T('sum.fix')}`);
    for (const f of findings.slice(0, 3)) {
      lines.push(`  ${T(f.key, f.vars).split('。')[0].split('. ')[0]}`);
    }
    lines.push(`- ${T('sum.one')}`);
  } else {
    lines.push(`- ${T('sum.nothing')}`);
  }

  lines.push(`- ${T('sum.numbers', {
    wpm: Math.round(s.wpm),
    artic: Math.round(s.articWpm),
    pause: s.pauseAvg.toFixed(2),
    range: s.rangeSt != null ? s.rangeSt.toFixed(1) : '—',
  })}`);

  return lines.join('\n');
}
