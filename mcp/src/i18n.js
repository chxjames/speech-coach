// 报告里的文案。指标/tip 的翻译从 strings.json 来（和网页版同一份），
// 报告骨架的几个标题写在这里，两种语言各一份。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const STRINGS = JSON.parse(readFileSync(join(here, 'strings.json'), 'utf8'));

const UI = {
  zh: {
    'title': '# 演讲体检报告：{name}',
    'total': '**总分 {total}**（场景：{scene} · 形态：{profile} · 水平：{level}）',
    'coverage': '> 覆盖 {pct}%；{missing} 未测，总分只在已测维度上相加。',
    'dims': '## 六维得分',
    'th.dim': '维度', 'th.score': '得分', 'th.scale': '比例',
    'metrics': '## 硬指标',
    'words': '- {words} 词，出声 {sec} 秒',
    'rate': '- 净语速 {wpm} wpm，发音速率 {artic} wpm',
    'pause': '- 停顿 {n} 处，平均 {avg} 秒，最长 {max} 秒',
    'longest': '- 最长一句 {sec} 秒',
    'pitch': '- 音高中位 {hz}，音域 {range}，句间变化 {sd}',
    'finals': '- 句尾：降 {fall} / 平 {flat} / 升 {rise}',
    'fillers': '- 软化词 {n} 个，密度 {rate}/100 词',
    'video': '- 画面 {w}×{h}，{kbps} kbps，中位亮度 {luma}，动作幅度 {motion}',
    'hz': '{v} Hz',
    'st': '{v} 半音',
    'tips': '## 最该改的地方（按丢分排序）',
    'segs': '## 逐句',
    'th.time': '时间', 'th.text': '内容', 'th.dur': '时长', 'th.pitch': '音高', 'th.ending': '句尾',
    'transcript': '## 文字稿',
    'note': '> 只有「内容与结构」是人工打分，其余全是自动计算。',
    'note.no-audio': '> 没有测到音频指标：这一份只有内容分；节奏、语调、清晰和总分都不给。',
    'sum.title': '## 总结',
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
    'dir.fall': '降', 'dir.flat': '平', 'dir.rise': '升',
    'untitled': '未命名文件',
  },
  en: {
    'title': '# Speech Coach report: {name}',
    'total': '**{total}** (scene: {scene} · format: {profile} · level: {level})',
    'coverage': '> Coverage {pct}%; {missing} not measured. The total adds only measured dimensions.',
    'dims': '## Dimensions',
    'th.dim': 'Dimension', 'th.score': 'Score', 'th.scale': 'Share',
    'metrics': '## Hard numbers',
    'words': '- {words} words, {sec}s of speech',
    'rate': '- Net rate {wpm} wpm, articulation rate {artic} wpm',
    'pause': '- {n} pauses, {avg}s on average, longest {max}s',
    'longest': '- Longest sentence {sec}s',
    'pitch': '- Median pitch {hz}, range {range}, sentence-to-sentence {sd}',
    'finals': '- Sentence endings: falls {fall} / flat {flat} / rises {rise}',
    'fillers': '- {n} softeners, density {rate} per 100 words',
    'video': '- Frame {w}×{h}, {kbps} kbps, median luma {luma}, motion {motion}',
    'hz': '{v} Hz',
    'st': '{v} semitones',
    'tips': '## Biggest losses first',
    'segs': '## Sentences',
    'th.time': 'Time', 'th.text': 'Text', 'th.dur': 'Length', 'th.pitch': 'Pitch', 'th.ending': 'Ending',
    'transcript': '## Transcript',
    'note': '> Only "Content & structure" is scored by you; everything else is measured.',
    'note.no-audio': '> No audio metrics were measured: only content is scored; pace, prosody, clarity and the total are not scored.',
    'sum.title': '## Summary',
    'sum.verdict.high': 'Solid — good enough to give this talk as it stands.',
    'sum.verdict.solid': 'Already usable — what is missing is detail, not structure.',
    'sum.verdict.mid': 'The skeleton is there — pace and delivery are what cost you, not the content.',
    'sum.verdict.low': 'Fix the basics first: finish the talk, make it clear, then worry about delivery.',
    'sum.verdict.incomplete': 'A core dimension was not measured, so no total this time. Look at the rows marked `–` first.',
    'sum.keep': 'Your strongest dimension right now is {dim} ({got}/{max}) — keep it.',
    'sum.fix': 'Three things to fix, in order:',
    'sum.one': 'If you only change one thing, do item 1 above.',
    'sum.nothing': 'Nothing significant is losing points at this level — try a stricter level.',
    'sum.numbers': 'Key numbers: net rate {wpm} wpm, articulation {artic} wpm, average pause {pause}s, pitch range {range} semitones.',
    'dir.fall': 'fall', 'dir.flat': 'flat', 'dir.rise': 'rise',
    'untitled': 'untitled',
  },
};

export function t(key, vars = {}, lang = 'en') {
  const dict = UI[lang] || UI.en;
  const fallback = UI.en;
  let s = dict[key] ?? fallback[key] ?? STRINGS[lang]?.[key] ?? STRINGS.en?.[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const LANGS = ['zh', 'en'];
