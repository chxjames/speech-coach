#!/usr/bin/env node
// speech-coach —— 把「演讲体检」做成 MCP 工具，任何支持 MCP 的 agent 都能一行接入。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { basename } from 'node:path';
import { statSync } from 'node:fs';

import { decodeToMono16k } from './audio.js';
import { transcribe } from './asr.js';
import { analyzeProsody } from './prosody.js';
import { analyzeVideo } from './video.js';
import { score, findings, weightsFor, SCENES, LEVELS, FORMATS, normalizeFormat, REFERENCE_MODEL } from './score.js';
import { buildReport } from './report.js';

const log = (...a) => console.error('[speech-coach]', ...a);

// A person typed `npx speech-coach` themselves: say what this is, do not sit
// silently waiting for JSON-RPC on stdin.
if (process.stdin.isTTY) {
  console.error(`speech-coach — an MCP server (stdio), not a click-and-run CLI
It is launched by an MCP client for you:

  Claude Code:   claude mcp add speech-coach -- npx -y speech-coach
  Codex:         ~/.codex/config.toml -> [mcp_servers.speech-coach] command = "npx", args = ["-y", "speech-coach"]
  Any MCP host:  command "npx", args ["-y", "speech-coach"]

It is not running now. Analysing a video by hand? Use the web app, nothing to
install: https://chxjames.github.io/speech-coach/`);
  process.exit(0);
}

const SCENE_IDS = Object.keys(SCENES);
const LEVEL_IDS = Object.keys(LEVELS);
const FORMAT_IDS = [...Object.keys(FORMATS), 'camera']; // camera is the old alias for desk

const server = new McpServer({ name: 'speech-coach', version: '0.2.0' });

server.tool(
  'analyze_speech',
  [
    'Analyze a recorded speech (video or audio file on this machine) and return a markdown coaching report:',
    'a six-dimension scorecard, hard measurements (rate, pauses, pitch range, sentence endings,',
    'softener density, framing), the biggest losses first, a sentence table and the transcript.',
    'The total is shown against the dimensions actually measured, with a coverage line; a missing picture or',
    'audio track is not scored as full marks.',
    '',
    'Runs fully local: ffmpeg decodes the file, Whisper (via transformers.js) transcribes it, pitch and',
    'pauses are measured from the waveform. Nothing is uploaded.',
    '',
    'Scenes: homework (class assignment), final (final presentation), contest (competition, calibrated on 12',
    '3MT winners), interview, defense (thesis defense), pitch (startup pitch). Level picks how strict the',
    'targets are: starter, solid, pro.',
  ].join(' '),
  {
    path: z.string().describe('Absolute path (or path relative to the current working directory) of the .mp4/.mov/.webm/.m4a/.wav file.'),
    scene: z.enum(SCENE_IDS).default('final').describe('What the talk is for. Weights differ: contest pushes pace and prosody, defense pushes content, interview pushes clarity.'),
    level: z.enum(LEVEL_IDS).default('solid').describe('How strict the targets are.'),
    format: z.enum(FORMAT_IDS).default('desk').describe('desk = webcam or phone at a desk / online class; stage = standing at a lectern; camera = old alias for desk.'),
    lang: z.enum(['zh', 'en']).default('en').describe('Language of the report itself.'),
    content: z.number().min(0).max(100).default(72).describe('Your human score for content and structure, 0-100. Only you can judge this; the rest is measured.'),
    composition: z.number().min(0).max(100).default(50).describe('Your human score for framing and lighting, 0-100 (ignored for stage).'),
    model: z.string().default(REFERENCE_MODEL).describe('Whisper model id. The default, small.en, is the model the targets were calibrated with; base.en is ~3x faster but hears more words, so rates come out higher; use a multilingual id such as Xenova/whisper-small for non-English audio, together with speechLang.'),
    speechLang: z.string().optional().describe('Language spoken in the recording, e.g. "zh" or "chinese". Needed with a multilingual model for non-English audio: the transcriber does not detect the language and otherwise translates the speech into English. Ignored by .en models.'),
    maxSeconds: z.number().min(5).max(1200).optional().describe('Only analyze the first N seconds.'),
  },
  async (args, extra) => {
    const file = args.path;
    try {
      const st = statSync(file);
      if (!st.isFile()) throw new Error(`not a file: ${file}`);
    } catch (e) {
      return { content: [{ type: 'text', text: `Cannot read ${file}: ${e.message}` }], isError: true };
    }

    const lang = args.lang;
    const isEnglishModel = /\.en$/i.test(args.model);
    const language = isEnglishModel ? 'english' : (args.speechLang || 'english');

    log('decoding', file);
    const decoded = await decodeToMono16k(file);
    let samples = decoded.samples;
    if (args.maxSeconds) samples = samples.subarray(0, Math.floor(args.maxSeconds * 16000));
    log(`audio ${(samples.length / 16000).toFixed(1)}s`);

    log('transcribing with', args.model);
    const token = extra?._meta?.progressToken;
    const report = async (progress, total, message) => {
      log(`${Math.round(progress / total * 100)}% ${message}`);
      if (!Number.isFinite(progress)) return;
      if (token == null) return;
      try {
        await extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken: token, progress, total, message },
        });
      } catch { /* 宿主不收进度就忽略 */ }
    };
    await report(1, 100, 'transcribing');
    const { text, words } = await transcribe(samples, {
      model: args.model,
      language,
      onProgress: (info) => {
        if (info && typeof info.done === 'number') {
          void report(1 + (info.done / info.total) * 80, 100, `chunk ${info.done}/${info.total}`);
        }
      },
    });
    log(`${words.length} words`);

    await report(82, 100, 'measuring prosody');
    const prosody = analyzeProsody(samples, words);
    let video = null;
    try { video = await analyzeVideo(file); } catch (e) { log('video probe failed:', e.message); }

    const fmt = normalizeFormat(args.format);
    const W = weightsFor(fmt, args.scene);
    const manual = {
      content: (args.content / 100) * W.content,
      composition: (args.composition / 100) * Math.max(0, W.production - Math.min(12, W.production)),
    };
    const scored = score({ s: prosody.summary, video, format: fmt, level: args.level, scene: args.scene, manual });
    const tips = findings({ s: prosody.summary, video, scored, format: fmt, level: args.level, scene: args.scene });

    await report(95, 100, 'writing report');
    const md = buildReport({
      name: basename(file),
      s: { ...prosody.summary, segments: prosody.segments, text },
      m: prosody.summary,
      video,
      scored,
      findings: tips,
      model: args.model,
      lang,
    });
    return { content: [{ type: 'text', text: md }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
log('speech-coach MCP server ready on stdio');
