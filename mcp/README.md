# speech-coach

An MCP server that watches a speech recording and hands back a scored coaching report.

Give it a video or audio file on your machine. It decodes the audio, transcribes it with Whisper,
measures pace, pauses, pitch range, sentence endings, softener density and the frame, and returns a
markdown report: a six-dimension scorecard, the biggest losses first, a sentence table and the
full transcript. The total is shown against the dimensions actually measured, with a coverage line.

Everything runs locally. The file is never uploaded.

```
You:    analyze ~/Desktop/pitch-final.mp4, it is a 3-minute startup pitch
Agent:  # Speech Coach report: pitch-final.mp4
        **74.2 / 100** (scene: pitch · format: at a desk · level: Intermediate)
        ...
```

## Install

Published on npm as [`speech-coach`](https://www.npmjs.com/package/speech-coach). No clone, no build:

**Claude Code**

```bash
claude mcp add speech-coach -- npx -y speech-coach
```

**Codex CLI** — `~/.codex/config.toml`:

```toml
[mcp_servers.speech-coach]
command = "npx"
args = ["-y", "speech-coach"]
```

**DSH / any MCP host** — the server speaks plain stdio MCP:

```json
{
  "mcpServers": {
    "speech-coach": { "command": "npx", "args": ["-y", "speech-coach"] }
  }
}
```

Requires Node 20+. `ffmpeg` ships with the package, so nothing else has to be installed.

## The tool: `analyze_speech`

| Argument | Type | Default | What it does |
| --- | --- | --- | --- |
| `path` | string | — | Video/audio file: `.mp4 .mov .webm .m4a .wav` |
| `scene` | `homework` `final` `contest` `interview` `defense` `pitch` | `final` | What the talk is for. Changes the weights: a defense leans on content, an interview on clarity, a competition on pace and prosody. |
| `level` | `starter` `solid` `pro` | `solid` | How strict the targets are. |
| `format` | `desk` `stage` | `desk` | Webcam/phone at a desk or online, or standing at a lectern. `camera` is the old alias for `desk`. |
| `lang` | `zh` `en` | `en` | Language of the report. |
| `content` | 0–100 | 72 | Your own score for content and structure. The only dimension a machine cannot judge. |
| `composition` | 0–100 | 50 | Your own score for framing and lighting. |
| `model` | string | `onnx-community/whisper-large-v3-turbo_timestamped` | Whisper model id. The default (large-v3-turbo, ~1.1 GB) is what the targets are calibrated with and the most accurate tested: 3.6 % word error rate against large-v3, vs 6.4 % for `small.en`. `Xenova/whisper-small.en` is ~1.5× faster; its totals are usually within 1–3 points. The model must return word timestamps (use a `_timestamped` export). For non-English audio also pass `speechLang`. |
| `speechLang` | string | — | Language spoken in the recording, e.g. `zh`. Required with a multilingual model for non-English audio: the transcriber does not detect the language and otherwise translates the speech into English. |
| `maxSeconds` | number | all | Only analyze the first N seconds. |

## What the score means

Six dimensions, weights depending on `scene` + `format`:

| Dimension | How it is measured |
| --- | --- |
| Content & structure | you (`content`) |
| Pace & rhythm | net words per minute, average pause, longest sentence |
| Prosody & presence | pitch range in semitones, sentence-to-sentence variation, share of statements that fall |
| Clarity | articulation rate, softener density (`like / just / actually / really / pretty`) |
| Camera motion | motion in the frame (not actual body language) |
| Camera & production | resolution, bitrate, exposure, plus your `composition` |

Stage targets are calibrated against published phonetic literature (Foulke 1968 on comprehension speed,
Goldman-Eisler 1968 on pause length, Aoyama et al. 2016 on pitch range, Tielen 1989 on pitch
variation) and against 12 three-minute-thesis winners measured with this same pipeline. Desk targets are
provisional: there is no labeled set of desk-speaking experts yet. The web version's
[`SCORING.md`](https://github.com/chxjames/speech-coach/blob/main/SCORING.md) documents every formula,
the coverage rules and the limitations.

## Accuracy and limits

- Word timestamps come from Whisper; on non-native fast English the base model mishears roughly one
  word in five. Numbers that depend on measured speech time survive that; the transcript does not.
- Sentence segmentation merges very short gaps, so the sentence count reads lower than a human count.
  Compare the share of rising endings, not the absolute sentence count.
- A pitch tracker can still pick the wrong octave on a noisy recording; the pitch range is the least
  reliable number in the report.
- One recording is one sample. Score differences under ~3 points are noise.
- This build and the web build decode audio differently (ffmpeg here, WebAudio in the browser) and the
  two Whisper runtimes do not produce identical word timings. On the same file they land within about
  4 points of each other; compare runs of the same build, not across builds.
- Pitch range is the weakest number: an octave slip on a few frames can widen it by a third on one
  build and not the other.

## Privacy

The file is read locally by `ffmpeg`; the transcript is produced locally by transformers.js (ONNX
runtime). Model weights are downloaded once from Hugging Face on first use and cached. No audio,
transcript or score leaves the machine.

## Related

- Web UI, no install, runs in the browser: <https://chxjames.github.io/speech-coach/>
- Source of both: <https://github.com/chxjames/speech-coach>

## License

MIT
