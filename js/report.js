import { fmtTime } from './audio.js';
import { t } from './i18n.js';

export function buildReport({ file, s, video, scored, tips, words, transcript }) {
  const d = scored.dims;
  const m = s.summary;            // 标量指标都在 summary 里
  const name = file?.name || t('report.untitled');
  const L = [];
  const bar = (got, max) => {
    const n = Math.max(0, Math.min(10, Math.round(got / max * 10)));
    return '█'.repeat(n) + '░'.repeat(10 - n);
  };

  L.push(t('report.title', { name }));
  L.push('');
  L.push(t('report.total', {
    total: scored.total.toFixed(1),
    scene: t('scene.' + (scored.scene || 'final')),
    profile: t('profile.' + scored.profile),
    level: t('level.' + scored.level),
  }));
  L.push('');
  L.push(t('report.dims'));
  L.push('');
  L.push(`| ${t('report.th.dim')} | ${t('report.th.score')} | ${t('report.th.scale')} |`);
  L.push('|---|---|---|');
  for (const k of ['content', 'pacing', 'prosody', 'clarity', 'body', 'production']) {
    L.push(`| ${t('dim.' + k)} | ${d[k].got.toFixed(1)} / ${d[k].max} | ${bar(d[k].got, d[k].max)} |`);
  }
  L.push('');
  L.push(t('report.metrics'));
  L.push('');
  L.push(t('report.words', { words: m.words, sec: m.speechSec.toFixed(1) }));
  L.push(t('report.rate', { wpm: Math.round(m.wpm), artic: Math.round(m.articWpm) }));
  L.push(t('report.pause', { n: m.pauses, avg: m.pauseAvg.toFixed(2), max: m.pauseMax.toFixed(1) }));
  L.push(t('report.longest', { sec: m.longest.toFixed(1) }));
  L.push(t('report.pitch', {
    hz: m.medianPitch ? t('report.hz', { v: Math.round(m.medianPitch) }) : '—',
    range: m.rangeSt != null ? t('report.st', { v: m.rangeSt.toFixed(1) }) : '—',
    sd: t('report.st', { v: m.segSdSt.toFixed(2) }),
  }));
  L.push(t('report.finals', { fall: m.finals.falling, flat: m.finals.flat, rise: m.finals.rising }));
  L.push(t('report.fillers', { n: m.fillers, rate: m.fillerRate.toFixed(1) }));
  if (video) {
    L.push(t('report.video', {
      w: video.width, h: video.height,
      kbps: Math.round(video.bitrateKbps || 0),
      luma: Math.round(video.lumaMedian || 0),
      motion: video.motionAvg.toFixed(1),
    }));
  }
  L.push('');
  if (tips.length) {
    L.push(t('report.tips'));
    L.push('');
    tips.forEach((tip, i) => L.push(`${i + 1}. ${t(tip.key, tip.vars)}`));
    L.push('');
  }
  L.push(t('report.segs'));
  L.push('');
  L.push(`| ${t('report.th.time')} | ${t('report.th.text')} | ${t('report.th.dur')} | ${t('report.th.pitch')} | ${t('report.th.ending')} |`);
  L.push('|---|---|---|---|---|');
  for (const g of s.segments) {
    const dir = g.finalSlope == null ? '—'
      : g.finalSlope < -0.5 ? t('dir.fall')
      : g.finalSlope > 0.5 ? t('dir.rise')
      : t('dir.flat');
    L.push(`| ${fmtTime(g.start)} | ${g.text.replace(/\\|/g, '\\\\|')} | ${g.dur.toFixed(1)}s | ${g.medianPitch ? Math.round(g.medianPitch) : '—'} | ${dir} |`);
  }
  L.push('');
  L.push(t('report.transcript'));
  L.push('');
  L.push('```');
  L.push(transcript || words.map(w => w.text).join(' '));
  L.push('```');
  L.push('');
  L.push(t('report.note'));
  return L.join('\n');
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
