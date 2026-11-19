import { decodeToMono16k, fmtTime } from './audio.js';
import { transcribe } from './asr.js';
import { analyzeProsody } from './prosody.js';
import { analyzeVideo } from './video.js';
import { score, findings } from './score.js';
import { buildReport, download } from './report.js';

const $ = (id) => document.getElementById(id);
const state = { file: null, words: [], transcript: '', prosody: null, video: null, scored: null, tips: [], manual: {} };

// 手机上默认用更小的模型、更少的并行，否则要等太久
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || innerWidth < 720;
if (isMobile) {
  $('model').value = 'Xenova/whisper-base.en';
  $('workers').value = '1';
}

// ---------- 选择文件 ----------
$('pick').onclick = () => $('file').click();
$('file').onchange = (e) => pick(e.target.files[0]);

const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
  e.preventDefault(); drop.classList.add('over');
}));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
  e.preventDefault(); drop.classList.remove('over');
}));
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) pick(f);
});

function pick(file) {
  if (!file) return;
  state.file = file;
  $('controls').classList.remove('hidden');
  $('fileinfo').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
}

// ---------- 跑分析 ----------
$('run').onclick = async () => {
  if (!state.file) return;
  $('run').disabled = true;
  $('progress').classList.remove('hidden');
  $('result').classList.add('hidden');
  const t0 = performance.now();

  try {
    setProgress(0.02, '解码音轨…');
    const { samples, duration } = await decodeToMono16k(state.file, (m) => setProgress(0.05, m));
    setProgress(0.1, `音频 ${duration.toFixed(1)} 秒，准备识别…`);

    const { words, text } = await transcribe(samples, {
      model: $('model').value,
      language: $('model').value.endsWith('.en') ? 'en' : undefined,
      workers: Number($('workers').value),
      onProgress: (p) => {
        if (p.stage === 'load') {
          setProgress(0.1 + (p.done ? p.done * 0.15 : 0), p.msg);
        } else {
          setProgress(0.25 + (p.done / p.total) * 0.6, p.msg);
        }
      },
    });

    state.words = words;
    state.transcript = text;

    setProgress(0.88, '算韵律…');
    await tick();
    state.prosody = analyzeProsody(samples, words);

    setProgress(0.94, '看画面…');
    try {
      state.video = await analyzeVideo(state.file);
    } catch (e) {
      console.warn('画面分析失败：', e);
      state.video = null;
    }

    setProgress(1, '打分…');
    render();
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setProgress(1, `完成，用时 ${secs} 秒。视频没有离开这台电脑。`);
  } catch (err) {
    console.error(err);
    $('status').innerHTML = '';
    const span = document.createElement('span');
    span.className = 'err';
    span.textContent = '出错了：' + (err && err.message || err);
    $('status').appendChild(span);
  } finally {
    $('run').disabled = false;
  }
};

function setProgress(p, msg) {
  $('barfill').style.width = Math.round(p * 100) + '%';
  if (msg) $('status').textContent = msg;
}
const tick = () => new Promise(r => setTimeout(r, 30));

// ---------- 渲染 ----------
function render() {
  const profile = $('profile').value;
  const level = $('level').value;
  state.scored = score({ s: state.prosody.summary, video: state.video, profile, level, manual: state.manual });
  state.tips = findings({ s: state.prosody.summary, video: state.video, scored: state.scored, level });

  $('result').classList.remove('hidden');
  renderScorecard();
  renderSegments();
  $('transcript').textContent = state.transcript;
}

function renderScorecard() {
  const s = state.prosody.summary;
  const sc = state.scored;
  const cols = { content: '内容与结构', pacing: '语速与节奏', prosody: '语调与表现力', clarity: '清晰度', body: '身体语言', production: '制作与镜头' };
  const notes = {
    content: '人工估计，可拖动',
    pacing: `${Math.round(s.wpm)} wpm · 停顿 ${s.pauseAvg.toFixed(2)}s`,
    prosody: `音域 ${s.rangeSt != null ? s.rangeSt.toFixed(1) : '—'} 半音 · 句尾升 ${s.finals.rising}`,
    clarity: `软化词 ${s.fillerRate.toFixed(1)}/100 词`,
    body: `动作幅度 ${(state.video?.motionAvg ?? 0).toFixed(1)}`,
    production: `${state.video?.width || 0}×${state.video?.height || 0}`,
  };

  const el = $('scorecard');
  el.innerHTML = `
    <div class="total"><b>${sc.total.toFixed(1)}</b><span>/ 100</span></div>
    <div class="dims">
      ${Object.entries(sc.dims).map(([k, d]) => `
        <div class="dim">
          <div class="name"><span>${cols[k]}</span><span>${d.got.toFixed(1)} / ${d.max}</span></div>
          <div class="mini"><i style="width:${Math.round(d.got / d.max * 100)}%"></i></div>
          <div class="note">${notes[k]}</div>
          ${k === 'content' ? `<input type="range" min="0" max="25" step="0.5" value="${state.manual.content ?? 18}" data-manual="content" style="width:100%;margin-top:8px">` : ''}
          ${k === 'production' && sc.compBudget > 0 ? `<input type="range" min="0" max="${sc.compBudget}" step="0.5" value="${state.manual.composition ?? sc.compBudget / 2}" data-manual="composition" style="width:100%;margin-top:8px">` : ''}
        </div>`).join('')}
    </div>
    ${state.tips.length ? `<div class="dims">${state.tips.map((t, i) => `
      <div class="dim"><div class="name"><span>建议 ${i + 1}</span><span>-${t.lost.toFixed(1)} 分</span></div>
      <div class="note" style="color:var(--text);margin-top:6px">${t.text}</div></div>`).join('')}</div>` : ''}
  `;

  el.querySelectorAll('input[data-manual]').forEach(inp => {
    inp.oninput = () => {
      state.manual[inp.dataset.manual] = Number(inp.value);
      const key = inp.dataset.manual;
      render();
      const again = document.querySelector(`input[data-manual="${key}"]`);
      if (again) again.focus();
    };
  });
}

function renderSegments() {
  const rows = state.prosody.segments.map(g => {
    const dir = g.finalSlope == null ? '—' : g.finalSlope < -0.5 ? '<span class="good">降</span>' : g.finalSlope > 0.5 ? '<span class="warn">升</span>' : '平';
    return `<tr>
      <td class="t">${fmtTime(g.start)}</td>
      <td>${escapeHtml(g.text)}</td>
      <td class="t">${g.dur.toFixed(1)}s</td>
      <td class="t">${g.medianPitch ? Math.round(g.medianPitch) + ' Hz' : '—'}</td>
      <td class="t">${dir}</td>
    </tr>`;
  }).join('');
  $('segments').innerHTML = `<thead><tr><th>时间</th><th>内容</th><th>时长</th><th>音高</th><th>句尾</th></tr></thead><tbody>${rows}</tbody>`;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function currentReport() {
  return buildReport({
    file: state.file, s: state.prosody, video: state.video,
    scored: state.scored, tips: state.tips, words: state.words, transcript: state.transcript,
  });
}

$('download').onclick = () => {
  download((state.file.name || 'speech').replace(/\.[^.]+$/, '') + '-report.md', currentReport());
};

// 调试用：控制台里 __report() 能看到生成的 markdown
window.__report = () => currentReport();
