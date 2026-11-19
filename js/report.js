import { fmtTime } from './audio.js';

export function buildReport({ file, s, video, scored, tips, words, transcript }) {
  const d = scored.dims;
  const m = s.summary;            // 标量指标都在 summary 里
  const name = file?.name || '未命名';
  const L = [];
  const bar = (got, max) => {
    const n = Math.max(0, Math.min(10, Math.round(got / max * 10)));
    return '█'.repeat(n) + '░'.repeat(10 - n);
  };

  L.push(`# 演讲体检报告：${name}`);
  L.push('');
  const lv = { starter: '入门', solid: '进阶', pro: '专业' }[scored.level] || '进阶';
  L.push(`**总分 ${scored.total.toFixed(1)} / 100**（形态：${scored.profile === 'camera' ? '对镜头' : '讲台'}；水平：${lv}）`);
  L.push('');
  L.push('## 六个维度');
  L.push('');
  L.push('| 维度 | 得分 | 占比 |');
  L.push('|---|---|---|');
  const cn = { content: '内容与结构', pacing: '语速与节奏', prosody: '语调与表现力', clarity: '清晰度', body: '身体语言', production: '制作与镜头' };
  for (const k of ['content', 'pacing', 'prosody', 'clarity', 'body', 'production']) {
    L.push(`| ${cn[k]} | ${d[k].got.toFixed(1)} / ${d[k].max} | ${bar(d[k].got, d[k].max)} |`);
  }
  L.push('');
  L.push('## 硬指标');
  L.push('');
  L.push(`- 词数 ${m.words}，说话总时长 ${m.speechSec.toFixed(1)}s`);
  L.push(`- 净语速 ${Math.round(m.wpm)} wpm，发音速率 ${Math.round(m.articWpm)} wpm`);
  L.push(`- 停顿 ${m.pauses} 次，平均 ${m.pauseAvg.toFixed(2)}s，最长 ${m.pauseMax.toFixed(1)}s`);
  L.push(`- 最长一句 ${m.longest.toFixed(1)}s`);
  L.push(`- 音高中位 ${m.medianPitch ? Math.round(m.medianPitch) + ' Hz' : '—'}，音域 ${m.rangeSt != null ? m.rangeSt.toFixed(1) + ' 半音' : '—'}，句间变化 ${m.segSdSt.toFixed(2)} 半音`);
  L.push(`- 句尾：降 ${m.finals.falling} / 平 ${m.finals.flat} / 升 ${m.finals.rising}`);
  L.push(`- 软化词 ${m.fillers} 处，密度 ${m.fillerRate.toFixed(1)}/100 词`);
  if (video) {
    L.push(`- 画面 ${video.width}×${video.height}，码率 ${Math.round(video.bitrateKbps || 0)} kbps，中位亮度 ${Math.round(video.lumaMedian || 0)}，动作幅度 ${video.motionAvg.toFixed(1)}`);
  }
  L.push('');
  if (tips.length) {
    L.push('## 按丢分排序，先改这些');
    L.push('');
    tips.forEach((t, i) => L.push(`${i + 1}. ${t.text}`));
    L.push('');
  }
  L.push('## 逐句');
  L.push('');
  L.push('| 时间 | 内容 | 时长 | 音高 | 句尾 |');
  L.push('|---|---|---|---|---|');
  for (const g of s.segments) {
    const dir = g.finalSlope == null ? '—' : g.finalSlope < -0.5 ? '降' : g.finalSlope > 0.5 ? '升' : '平';
    L.push(`| ${fmtTime(g.start)} | ${g.text.replace(/\|/g, '\\|')} | ${g.dur.toFixed(1)}s | ${g.medianPitch ? Math.round(g.medianPitch) : '—'} | ${dir} |`);
  }
  L.push('');
  L.push('## 文字稿');
  L.push('');
  L.push('```');
  L.push(transcript || words.map(w => w.text).join(' '));
  L.push('```');
  L.push('');
  L.push('> 只有「内容与结构」是人工打分（页面上的滑杆），其余全是自动计算。');
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
