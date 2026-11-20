// 界面文案字典。中文是原文，英文是翻译；两种语言共用同一批 key。
// 静态文案走 index.html 的 data-i18n，动态文案（进度、建议、报告）走 t()。

const DICT = {
  zh: {
    'doc.title': '演讲体检 · Speech Coach',
    'h1': '演讲体检',
    'sub': '拖一个演讲视频进来，在浏览器里算出语速、停顿、音高、句尾、软词密度和画面分。<strong>视频不会离开你的电脑。</strong>',
    'drop.lead': '把视频拖到这里，或',
    'drop.pick': '选择文件',
    'drop.hint': '支持 mp4 / mov / webm / m4a，建议 3 分钟以内',
    'label.scene': '场景',
    'label.profile': '形态',
    'label.level': '水平',
    'label.model': '识别模型',
    'label.workers': '并行数',
    'opt.profile.camera': '对镜头 / 网课',
    'opt.profile.desk': '桌前 / 网课',
    'opt.profile.stage': '讲台站立',
    'opt.level.starter': '入门（第一次上台）',
    'opt.level.solid': '进阶（能讲完，想讲好）',
    'opt.level.pro': '专业（比赛 / 路演）',
    'opt.scene.homework': '课堂作业 / 练习',
    'opt.scene.final': '期末展示 / 汇报',
    'opt.scene.contest': '比赛（3MT 一类）',
    'opt.scene.interview': '面试 / 求职',
    'opt.scene.defense': '答辩 / 评审',
    'opt.scene.pitch': '路演 / 推销',
    'scene.homework': '课堂作业',
    'scene.final': '期末展示',
    'scene.contest': '比赛',
    'scene.interview': '面试',
    'scene.defense': '答辩',
    'scene.pitch': '路演',
    'scene.hint.homework': '讲完、讲清就行；论据可以少一点，别超时。',
    'scene.hint.final': '内容要多、结构要清：问题 → 方法 → 结果 → 意义。',
    'scene.hint.contest': '按 12 个 3MT 获奖者的实测画像打分：语速 150–180，停顿短而准，结尾落地。',
    'scene.hint.interview': '宁可短、宁可干净：结论先说，少用软化词。',
    'scene.hint.defense': '内容最重，术语可以保留，语速慢一点没关系。',
    'scene.hint.pitch': '要冲、要有起伏：关键处停顿，把重音砸下去。',
    'opt.model.small_en': 'small.en（英文，约 250MB）',
    'opt.model.base_en': 'base.en（更快，吃字多）',
    'opt.model.small': 'small（多语言，中文用这个）',
    'run': '开始分析',
    'status.ready': '准备中…',
    'h2.segments': '逐句',
    'h2.transcript': '文字稿',
    'btn.download': '下载报告（.md）',

    'progress.read': '读取文件…',
    'progress.decode': '解码音轨…',
    'progress.resample': '重采样到 16kHz…',
    'progress.audio': '音频 {dur} 秒，准备识别…',
    'progress.workers': '启动 {n} 个识别线程…',
    'progress.loaded': '模型已加载 {n} 个线程',
    'progress.download': '下载模型 {pct}% · {file}',
    'progress.asr': '识别中 {done}/{total} 段',
    'progress.prosody': '算韵律…',
    'progress.video': '看画面…',
    'progress.scoring': '打分…',
    'progress.done': '完成，用时 {secs} 秒。视频没有离开这台电脑。',
    'progress.error': '出错了：{msg}',

    'dim.content': '内容与结构',
    'dim.pacing': '语速与节奏',
    'dim.prosody': '语调与表现力',
    'dim.clarity': '清晰度',
    'dim.body': '画面运动',
    'dim.production': '制作与镜头',

    'level.starter': '入门',
    'level.solid': '进阶',
    'level.pro': '专业',
    'profile.camera': '对镜头',
    'profile.desk': '桌前',
    'profile.stage': '讲台',

    'note.content': '人工估计，可拖动',
    'note.content.estimated': '默认 72%，可拖动；这是自评，不是测量',
    'note.pacing': '{wpm} wpm · 停顿 {pause}s',
    'note.prosody': '音域 {range} 半音 · 上扬句尾 {rising}',
    'note.clarity': '软化词 {rate}/100 词',
    'note.body': '画面运动 {motion}',
    'note.unavailable.no-video': '没有视频，未测',
    'note.unavailable.no-audio': '没有音频/转写，未测',
    'note.unavailable.no-pitch': '没有可用的音高，未测',
    'note.unavailable.no-data': '未测',
    'score.coverage': '覆盖 {pct}%：{missing} 未测；总分只在已测维度上相加，不能直接和 /100 比。',
    'list.sep': '、',

    'tip.n': '建议 {n}',
    'tip.cost': '-{x} 分',

    'seg.time': '时间',
    'seg.text': '内容',
    'seg.dur': '时长',
    'seg.pitch': '音高',
    'seg.final': '句尾',
    'dir.fall': '降',
    'dir.rise': '升',
    'dir.flat': '平',

    'tip.fillers': '软化词密度 {rate}/100 词（专业演讲者 0.5–1.9）。like / just / actually / really / pretty 每 17 个词就冒一个，听感发软。',
    'tip.production': '画面 {w}×{h}，中位亮度 {luma}。构图和灯光还能再拿 {lost} 分。',
    'tip.finals': '句尾上扬占 {pct}%（{n}/{total}）。陈述句句尾该往下落，上扬留给问句。',
    'tip.artic': '发音速率 {wpm} wpm，只有真正开口时才这么快，容易连读吃掉辅音。',
    'tip.longest': '最长一句 {sec} 秒。超过 10 秒的句子，观众会丢失主语。',
    'tip.motion': '画面动作幅度 {motion}（专业对镜头演讲者在 9–10）。手势太小，手可能根本没进画。',

    'report.title': '# 演讲体检报告：{name}',
    'report.total': '**总分 {total}**（场景：{scene}；形态：{profile}；水平：{level}）',
    'report.coverage': '> 覆盖 {pct}%；{missing} 未测，总分只在已测维度上相加。',
    'report.dims': '## 六个维度',
    'report.th.dim': '维度',
    'report.th.score': '得分',
    'report.th.scale': '占比',
    'report.metrics': '## 硬指标',
    'report.words': '- 词数 {words}，说话总时长 {sec}s',
    'report.rate': '- 净语速 {wpm} wpm，发音速率 {artic} wpm',
    'report.pause': '- 停顿 {n} 次，平均 {avg}s，最长 {max}s',
    'report.longest': '- 最长一句 {sec}s',
    'report.pitch': '- 音高中位 {hz}，音域 {range}，句间变化 {sd}',
    'report.hz': '{v} Hz',
    'report.st': '{v} 半音',
    'report.finals': '- 句尾：降 {fall} / 平 {flat} / 升 {rise}',
    'report.fillers': '- 软化词 {n} 处，密度 {rate}/100 词',
    'report.video': '- 画面 {w}×{h}，码率 {kbps} kbps，中位亮度 {luma}，动作幅度 {motion}',
    'report.tips': '## 按丢分排序，先改这些',
    'report.segs': '## 逐句',
    'report.th.time': '时间',
    'report.th.text': '内容',
    'report.th.dur': '时长',
    'report.th.pitch': '音高',
    'report.th.ending': '句尾',
    'report.transcript': '## 文字稿',
    'report.note': '> 只有「内容与结构」是人工打分（页面上的滑杆），其余全是自动计算。',
    'sum.title': '总结',
    'sum.verdict.high': '整体很稳——这一档里属于能直接上台的版本。',
    'sum.verdict.solid': '已经能用——差的是细节，不是骨架。',
    'sum.verdict.mid': '骨架有了——主要吃亏在节奏和表达，内容本身不弱。',
    'sum.verdict.low': '先把基础补上：讲完、讲清，再谈表现力。',
    'sum.verdict.incomplete': '这次有核心维度没测到，总分先不给；先看上面哪些项是 `–`。',
    'sum.keep': '目前最稳的是 {dim}（{got}/{max}），保持住。',
    'sum.fix': '优先改这三件：',
    'sum.one': '如果只改一件事：先做上面第 1 条。',
    'sum.nothing': '这一档没有明显扣分项——想再进步就换更严的水平试试。',
    'sum.numbers': '几个关键数：净语速 {wpm} wpm、发音速率 {artic} wpm、平均停顿 {pause} 秒、音域 {range} 半音。',
    'report.untitled': '未命名',
  },

  en: {
    'doc.title': 'Speech Coach — score your speech',
    'h1': 'Speech Coach',
    'sub': 'Drop in a speech video. The browser measures pace, pauses, pitch, sentence endings, softener density and the frame. <strong>The video never leaves your computer.</strong>',
    'drop.lead': 'Drag a video here, or',
    'drop.pick': 'choose a file',
    'drop.hint': 'mp4 / mov / webm / m4a · three minutes or less works best',
    'label.profile': 'Format',
    'label.scene': 'Scene',
    'label.level': 'Level',
    'label.model': 'Model',
    'label.workers': 'Workers',
    'opt.profile.camera': 'On camera / online class',
    'opt.profile.desk': 'Desk / online',
    'opt.profile.stage': 'On stage',
    'opt.level.starter': 'Beginner (first time on stage)',
    'opt.level.solid': 'Intermediate (you finish, now polish)',
    'opt.level.pro': 'Advanced (competition / pitch)',
    'opt.scene.homework': 'Class assignment / practice',
    'opt.scene.final': 'Final presentation / report',
    'opt.scene.contest': 'Competition (3MT-style)',
    'opt.scene.interview': 'Job interview',
    'opt.scene.defense': 'Thesis defense / review',
    'opt.scene.pitch': 'Pitch / sales talk',
    'scene.homework': 'class assignment',
    'scene.final': 'final presentation',
    'scene.contest': 'competition',
    'scene.interview': 'interview',
    'scene.defense': 'defense',
    'scene.pitch': 'pitch',
    'scene.hint.homework': 'Finish it and be clear; fewer sources is fine, just do not run over.',
    'scene.hint.final': 'More content, clear structure: problem → method → result → why it matters.',
    'scene.hint.contest': 'Scored against 12 measured 3MT winners: 150–180 wpm, short precise pauses, endings that land.',
    'scene.hint.interview': 'Shorter and cleaner wins: answer first, drop the softeners.',
    'scene.hint.defense': 'Content matters most; jargon is allowed; a slower pace is fine.',
    'scene.hint.pitch': 'Drive it: dynamics, pauses before the point, punch the stressed word.',
    'opt.model.small_en': 'small.en · English, ~250 MB',
    'opt.model.base_en': 'base.en · about twice as fast, sloppier',
    'opt.model.small': 'small · multilingual (use this for Chinese)',
    'run': 'Analyze',
    'status.ready': 'Ready…',
    'h2.segments': 'Sentences',
    'h2.transcript': 'Transcript',
    'btn.download': 'Download report (.md)',

    'progress.read': 'Reading the file…',
    'progress.decode': 'Decoding the audio track…',
    'progress.resample': 'Resampling to 16 kHz…',
    'progress.audio': '{dur}s of audio — starting transcription…',
    'progress.workers': 'Starting {n} recognition workers…',
    'progress.loaded': 'Model loaded in {n} workers',
    'progress.download': 'Downloading model {pct}% · {file}',
    'progress.asr': 'Transcribing {done}/{total}',
    'progress.prosody': 'Measuring prosody…',
    'progress.video': 'Reading the frame…',
    'progress.scoring': 'Scoring…',
    'progress.done': 'Done in {secs}s. The video never left this computer.',
    'progress.error': 'Something went wrong: {msg}',

    'dim.content': 'Content & structure',
    'dim.pacing': 'Pace & rhythm',
    'dim.prosody': 'Prosody & presence',
    'dim.clarity': 'Clarity',
    'dim.body': 'Camera motion',
    'dim.production': 'Camera & production',

    'level.starter': 'Beginner',
    'level.solid': 'Intermediate',
    'level.pro': 'Advanced',
    'profile.camera': 'on camera',
    'profile.desk': 'at a desk',
    'profile.stage': 'on stage',

    'note.content': 'Your call — drag it',
    'note.content.estimated': 'Default 72% — drag it; this is your estimate, not a measurement',
    'note.pacing': '{wpm} wpm · {pause}s pauses',
    'note.prosody': '{range} semitones · rising endings {rising}',
    'note.clarity': '{rate} softeners per 100 words',
    'note.body': 'motion {motion}',
    'note.unavailable.no-video': 'No video — not measured',
    'note.unavailable.no-audio': 'No audio/transcript — not measured',
    'note.unavailable.no-pitch': 'No usable pitch — not measured',
    'note.unavailable.no-data': 'Not measured',
    'score.coverage': 'Coverage {pct}%: {missing} not measured. The total adds only measured dimensions; do not compare it directly with /100.',
    'list.sep': ', ',

    'tip.n': 'Tip {n}',
    'tip.cost': '-{x} pts',

    'seg.time': 'Time',
    'seg.text': 'Text',
    'seg.dur': 'Length',
    'seg.pitch': 'Pitch',
    'seg.final': 'Ending',
    'dir.fall': 'falls',
    'dir.rise': 'rises',
    'dir.flat': 'flat',

    'tip.fillers': 'Softener density {rate} per 100 words (professional speakers: 0.5–1.9). A like / just / actually / really / pretty every 17 words makes you sound unsure.',
    'tip.production': 'Frame is {w}×{h}, median luma {luma}. Framing and lighting still have {lost} points in them.',
    'tip.finals': '{pct}% of sentences end on a rise ({n}/{total}). Statements should fall; save the rise for questions.',
    'tip.artic': 'Articulation rate {wpm} wpm — you only speak that fast when actually talking, so consonants get swallowed.',
    'tip.longest': 'Longest sentence: {sec}s. Past ten seconds, listeners lose track of the subject.',
    'tip.motion': 'Motion {motion} (professional on-camera speakers sit at 9–10). Your gestures are small — your hands may not even be in frame.',

    'report.title': '# Speech Coach report: {name}',
    'report.total': '**{total}** (scene: {scene}; format: {profile}; level: {level})',
    'report.coverage': '> Coverage {pct}%; {missing} not measured. The total adds only measured dimensions.',
    'report.dims': '## The six dimensions',
    'report.th.dim': 'Dimension',
    'report.th.score': 'Score',
    'report.th.scale': 'Scale',
    'report.metrics': '## Hard numbers',
    'report.words': '- {words} words, {sec}s of speech',
    'report.rate': '- Net rate {wpm} wpm, articulation rate {artic} wpm',
    'report.pause': '- {n} pauses, {avg}s on average, longest {max}s',
    'report.longest': '- Longest sentence {sec}s',
    'report.pitch': '- Median pitch {hz}, range {range}, sentence-to-sentence {sd}',
    'report.hz': '{v} Hz',
    'report.st': '{v} semitones',
    'report.finals': '- Sentence endings: falls {fall} / flat {flat} / rises {rise}',
    'report.fillers': '- {n} softeners, density {rate} per 100 words',
    'report.video': '- Frame {w}×{h}, {kbps} kbps, median luma {luma}, motion {motion}',
    'report.tips': '## Biggest losses first',
    'report.segs': '## Sentences',
    'report.th.time': 'Time',
    'report.th.text': 'Text',
    'report.th.dur': 'Length',
    'report.th.pitch': 'Pitch',
    'report.th.ending': 'Ending',
    'report.transcript': '## Transcript',
    'report.note': '> Only “Content & structure” is scored by you (the sliders). Everything else is measured.',
    'sum.title': 'Summary',
    'sum.verdict.high': 'Solid — good enough to give this talk as it stands.',
    'sum.verdict.solid': 'Already usable — what is missing is detail, not structure.',
    'sum.verdict.mid': 'The skeleton is there — pace and delivery are what cost you, not the content.',
    'sum.verdict.low': 'Fix the basics first: finish the talk, make it clear, then worry about delivery.',
    'sum.verdict.incomplete': 'A core dimension was not measured, so no total this time. Look at the rows marked `–` first.',
    'sum.keep': 'Your strongest dimension right now is {dim} ({got}/{max}) — keep it.',
    'sum.fix': 'Three things to fix, in order:',
    'sum.one': 'If you only change one thing, do item 1 above.',
    'sum.nothing': 'Nothing significant is losing points at this level — try a stricter level.',
    'sum.numbers': 'Key numbers: net rate {wpm} wpm, articulation {artic} wpm, average pause {pause} s, pitch range {range} semitones.',
    'report.untitled': 'untitled',
  },
};

const STORE_KEY = 'sc.lang';

function detect() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch (e) { /* 隐私模式下 localStorage 可能不可用 */ }
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

let lang = detect();

export function getLang() { return lang; }

// 判断一个字符串是不是字典里的 key（进度消息既能传 key，也能传已经翻译好的句子）
export function hasKey(key) {
  return typeof key === 'string' && (key in DICT[lang] || key in DICT.zh);
}

export function t(key, vars) {
  const table = DICT[lang] || DICT.en;
  const s = table[key] ?? DICT.zh[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

// 把静态文案（data-i18n / data-i18n-html）刷一遍
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  if (root === document) {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('doc.title');
    const btn = document.getElementById('lang');
    if (btn) btn.textContent = lang === 'zh' ? 'EN' : '中文';
  }
}

export function setLang(next) {
  lang = next === 'zh' ? 'zh' : 'en';
  try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* 忽略 */ }
  applyStatic();
  window.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
}

export function onLangChange(fn) {
  window.addEventListener('langchange', () => fn(lang));
}

applyStatic();
