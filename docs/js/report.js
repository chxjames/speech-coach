import { fmtTime } from './audio.js';
import { t } from './i18n.js';
import { REFERENCE_MODEL } from './score.js';

const shortModel = (id) => String(id || '').replace(/^.*\//, '');

export function buildReport({ file, s, video, scored, tips, words, transcript, model = REFERENCE_MODEL }) {
  const d = scored.dims;
  const m = s.summary;            // 标量指标都在 summary 里
  const name = file?.name || t('report.untitled');
  const L = [];
  const bar = (got, max) => {
    if (!Number.isFinite(got) || !Number.isFinite(max) || max <= 0) return '░'.repeat(10);
    const n = Math.max(0, Math.min(10, Math.round(got / max * 10)));
    return '█'.repeat(n) + '░'.repeat(10 - n);
  };

  L.push(t('report.title', { name }));
  L.push('');
  L.push(t('report.total', {
    total: scored.total == null ? '–' : `${scored.total.toFixed(1)} / ${scored.totalMax}`,
    scene: t('scene.' + (scored.scene || 'final')),
    profile: t('profile.' + scored.profile),
    level: t('level.' + scored.level),
  }));
  if (scored.coverage < 0.999) {
    const missing = Object.entries(d)
      .filter(([, v]) => !v.available || v.partial)
      .map(([k, v]) => (v.available ? t('dim.partial', { dim: t('dim.' + k) }) : t('dim.' + k)));
    L.push(t('report.coverage', { pct: Math.round(scored.coverage * 100), missing: missing.join(t('list.sep')) }));
  }
  if (!scored.silenceKnown && d.pacing.available) L.push(t('report.silence', { n: (scored.pausesPerMin ?? 0).toFixed(1) }));
  L.push(t('report.rubric', { v: scored.rubric, model: shortModel(model) }));
  if (model !== REFERENCE_MODEL) L.push(t('report.model.mismatch', { ref: shortModel(REFERENCE_MODEL) }));
  L.push('');
  L.push(t('report.dims'));
  L.push('');
  L.push(`| ${t('report.th.dim')} | ${t('report.th.score')} | ${t('report.th.scale')} |`);
  L.push('|---|---|---|');
  for (const k of ['content', 'pacing', 'prosody', 'clarity', 'body', 'production']) {
    const got = d[k].got;
    L.push(`| ${t('dim.' + k)} | ${got == null ? '–' : `${got.toFixed(1)} / ${d[k].max}`} | ${got == null ? '–' : bar(got, d[k].max)} |`);
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

  // 总结放最后：读完前面的表和逐句清单，这里只回答"所以呢、我该改什么"
  L.push('');
  L.push(t('sum.title'));
  L.push('');
  L.push(summaryLines(scored, tips, m));
  return L.join('\n');
}

// 一句话判断 + 最稳的一项 + 最该改的三件事 + "只改一件就改这个"
function summaryLines(scored, tips, m) {
  const d = scored.dims;
  const total = scored.total;
  const out = [];

  if (total == null) {
    out.push(`- ${t('sum.verdict.incomplete')}`);
    return out.join('\n');
  }

  const key = total >= 85 ? 'sum.verdict.high'
    : total >= 70 ? 'sum.verdict.solid'
    : total >= 55 ? 'sum.verdict.mid'
    : 'sum.verdict.low';
  out.push(`- ${t(key)}`);

  const order = ['content', 'pacing', 'prosody', 'clarity', 'body', 'production'];
  const share = order
    .filter(k => d[k].available && Number.isFinite(d[k].got))
    .map(k => ({ k, v: d[k].max ? d[k].got / d[k].max : 0 }))
    .sort((a, b) => b.v - a.v);
  if (share.length && share[0].v > 0.6) {
    out.push(`- ${t('sum.keep', {
      dim: t('dim.' + share[0].k),
      got: d[share[0].k].got.toFixed(1),
      max: d[share[0].k].max,
    })}`);
  }

  if (tips.length) {
    out.push(`- ${t('sum.fix')}`);
    tips.slice(0, 3).forEach((tip, i) => out.push(`  ${i + 1}. ${t(tip.key, tip.vars)}`));
    out.push(`- ${t('sum.one', { text: t(tips[0].key, tips[0].vars) })}`);
  } else {
    out.push(`- ${t('sum.nothing')}`);
  }

  if (m && Number.isFinite(m.wpm)) out.push(`- ${t('sum.numbers', {
    wpm: Math.round(m.wpm),
    artic: Math.round(m.articWpm),
    pause: m.pauseAvg.toFixed(1),
    range: m.rangeSt != null ? m.rangeSt.toFixed(1) : '—',
  })}`);
  return out.join('\n');
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
