import { decodeToMono16k, fmtTime } from './audio.js';
import { transcribe } from './asr.js';
import { analyzeProsody } from './prosody.js';
import { analyzeVideo } from './video.js';
import { score, findings } from './score.js';
import { buildReport, download } from './report.js';
import { t, hasKey, setLang, getLang, onLangChange } from './i18n.js';

const $ = (id) => document.getElementById(id);
const state = { file: null, model: null, words: [], transcript: '', prosody: null, video: null, scored: null, tips: [], manual: {} };

// 手机上默认用更小的模型、更少的并行，否则要等太久
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || innerWidth < 720;
if (isMobile) {
  $('model').value = 'Xenova/whisper-base.en';
  $('workers').value = '1';
}

// ---------- 场景：记住上次选的，并显示一句说明 ----------
const SCENE_KEY = 'sc.scene';
try {
  const saved = localStorage.getItem(SCENE_KEY);
  if (saved && $('scene').querySelector(`option[value="${saved}"]`)) $('scene').value = saved;
} catch (e) { /* 隐私模式下 localStorage 可能不可用 */ }

function paintSceneHint() {
  $('scenehint').textContent = t('scene.hint.' + $('scene').value);
}
$('scene').onchange = () => {
  try { localStorage.setItem(SCENE_KEY, $('scene').value); } catch (e) { /* ignore */ }
  paintSceneHint();
  if (state.scored) render();
};
paintSceneHint();

// ---------- 语言 ----------
$('lang').onclick = () => setLang(getLang() === 'zh' ? 'en' : 'zh');
onLangChange(() => {
  if (lastStatus) {
    $('status').textContent = lastStatus.key ? t(lastStatus.key, lastStatus.vars) : lastStatus.text;
  }
  paintSceneHint();
  if (state.scored) render();
  if (state.file) $('fileinfo').textContent = `${state.file.name} · ${(state.file.size / 1024 / 1024).toFixed(1)} MB`;
});

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
    setProgress(0.02, 'progress.decode');
    const { samples, duration } = await decodeToMono16k(state.file, (m) => setProgress(0.05, m));
    setProgress(0.1, 'progress.audio', { dur: duration.toFixed(1) });

    state.model = $('model').value;   // 报告里要写明用的哪个模型
    const { words, text } = await transcribe(samples, {
      model: $('model').value,
      // 多语言选项在界面上写的是“中文用这个”。transformers.js 不会自动识别语言，必须明确传。
      language: $('model').value.endsWith('.en') ? 'en' : 'chinese',
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

    setProgress(0.88, 'progress.prosody');
    await tick();
    state.prosody = analyzeProsody(samples, words);

    setProgress(0.94, 'progress.video');
    try {
      state.video = await analyzeVideo(state.file);
      if (!state.video?.width) state.video = null;
    } catch (e) {
      console.warn('画面分析失败：', e);
      state.video = null;
    }

    setProgress(1, 'progress.scoring');
    render();
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setProgress(1, 'progress.done', { secs });
  } catch (err) {
    console.error(err);
    $('status').innerHTML = '';
    const span = document.createElement('span');
    span.className = 'err';
    span.textContent = t('progress.error', { msg: (err && err.message) || err });
    $('status').appendChild(span);
  } finally {
    $('run').disabled = false;
  }
};

// 进度消息记下 key/vars，切语言时能重画（已经翻译好的句子就原样重放）
let lastStatus = null;
function setProgress(p, msg, vars) {
  $('barfill').style.width = Math.round(p * 100) + '%';
  if (!msg) return;
  lastStatus = hasKey(msg) ? { key: msg, vars } : { text: msg };
  $('status').textContent = lastStatus.key ? t(lastStatus.key, vars) : lastStatus.text;
}
const tick = () => new Promise(r => setTimeout(r, 30));

// ---------- 渲染 ----------
function render() {
  const profile = $('profile').value;
  const level = $('level').value;
  const scene = $('scene').value;
  state.scored = score({ s: state.prosody.summary, video: state.video, format: profile, level, scene, manual: state.manual });
  state.tips = findings({ s: state.prosody.summary, video: state.video, scored: state.scored, format: profile, level, scene });

  $('result').classList.remove('hidden');
  renderScorecard();
  renderSegments();
  $('transcript').textContent = state.transcript;
}

function renderScorecard() {
  const s = state.prosody.summary;
  const sc = state.scored;
  const unavailable = (reason) => t('note.unavailable.' + (reason || 'no-data'));
  const notes = {
    content: sc.dims.content.estimated ? t('note.content.estimated') : t('note.content'),
    pacing: t('note.pacing', { wpm: Math.round(s.wpm), pause: s.pauseAvg.toFixed(2) }),
    prosody: t('note.prosody', { range: s.rangeSt != null ? s.rangeSt.toFixed(1) : '—', rising: s.finals.rising }),
    clarity: t('note.clarity', { rate: s.fillerRate.toFixed(1) }),
    body: state.video ? t('note.body', { motion: (state.video.motionAvg ?? 0).toFixed(1) }) : unavailable('no-video'),
    production: state.video ? `${state.video.width}×${state.video.height}` : unavailable('no-video'),
  };

  const missing = Object.entries(sc.dims)
    .filter(([, d]) => !d.available || d.partial)
    .map(([k, d]) => (d.available ? t('dim.partial', { dim: t('dim.' + k) }) : t('dim.' + k)));
  if (!sc.silenceKnown && sc.dims.pacing.available) {
    notes.pacing = t('note.silence', { n: (sc.pausesPerMin ?? 0).toFixed(1) });
  }
  const coverage = sc.coverage < 0.999
    ? `<div class="note" style="margin:6px 0 0">${t('score.coverage', { pct: Math.round(sc.coverage * 100), missing: missing.join(t('list.sep')) })}</div>`
    : '';

  const el = $('scorecard');
  el.innerHTML = `
    <div class="total"><b>${sc.total == null ? '–' : sc.total.toFixed(1)}</b><span>/ ${sc.totalMax == null ? 100 : Math.round(sc.totalMax)}</span></div>
    ${coverage}
    <div class="dims">
      ${Object.entries(sc.dims).map(([k, d]) => {
        const available = d.available && d.got != null;
        const got = available ? d.got : null;
        return `
        <div class="dim">
          <div class="name"><span>${t('dim.' + k)}</span><span>${available ? `${got.toFixed(1)} / ${d.max}` : `– / ${d.max}`}</span></div>
          <div class="mini"><i style="width:${available ? Math.round(got / d.max * 100) : 0}%"></i></div>
          <div class="note">${available ? notes[k] : unavailable(d.reason)}</div>
          ${k === 'content' ? `<input type="range" min="0" max="${d.max}" step="0.5" value="${state.manual.content ?? Math.round(d.max * 0.72)}" data-manual="content" style="width:100%;margin-top:8px">` : ''}
          ${k === 'production' && available && sc.compBudget > 0 ? `<input type="range" min="0" max="${sc.compBudget}" step="0.5" value="${state.manual.composition ?? sc.compBudget / 2}" data-manual="composition" style="width:100%;margin-top:8px">` : ''}
        </div>`;
      }).join('')}
    </div>
    ${state.tips.length ? `<div class="dims">${state.tips.map((tip, i) => `
      <div class="dim"><div class="name"><span>${t('tip.n', { n: i + 1 })}</span><span>${t('tip.cost', { x: tip.lost.toFixed(1) })}</span></div>
      <div class="note" style="color:var(--text);margin-top:6px">${t(tip.key, tip.vars)}</div></div>`).join('')}</div>` : ''}
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
    const dir = g.finalSlope == null ? '—'
      : g.finalSlope < -0.5 ? `<span class="good">${t('dir.fall')}</span>`
      : g.finalSlope > 0.5 ? `<span class="warn">${t('dir.rise')}</span>`
      : t('dir.flat');
    return `<tr>
      <td class="t">${fmtTime(g.start)}</td>
      <td>${escapeHtml(g.text)}</td>
      <td class="t">${g.dur.toFixed(1)}s</td>
      <td class="t">${g.medianPitch ? Math.round(g.medianPitch) + ' Hz' : '—'}</td>
      <td class="t">${dir}</td>
    </tr>`;
  }).join('');
  $('segments').innerHTML = `<thead><tr><th>${t('seg.time')}</th><th>${t('seg.text')}</th><th>${t('seg.dur')}</th><th>${t('seg.pitch')}</th><th>${t('seg.final')}</th></tr></thead><tbody>${rows}</tbody>`;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function currentReport() {
  return buildReport({
    file: state.file, s: state.prosody, video: state.video,
    scored: state.scored, tips: state.tips, words: state.words, transcript: state.transcript,
    model: state.model,
  });
}

$('download').onclick = () => {
  download((state.file.name || 'speech').replace(/\.[^.]+$/, '') + '-report.md', currentReport());
};

// 调试用：控制台里 __report() 能看到生成的 markdown
window.__report = () => currentReport();
window.__state = state;   // 调试用：控制台里能看中间结果
