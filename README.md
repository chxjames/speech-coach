# Speech Coach — 演讲体检

Drop in a video of your speech, get a score and a list of things to fix.

Everything runs **in your browser**. The video never leaves your computer — no server, no upload, no API key.

[中文说明](README.zh.md)

## What it measures

| 维度 | 权重（对镜头） | 权重（讲台） | 怎么算 |
|---|---|---|---|
| 内容与结构 Content | 25 | 25 | 人工打分（滑杆） |
| 语速与节奏 Pacing | 20 | 20 | 净语速 + 平均停顿 |
| 语调与表现力 Prosody | 15 | 20 | 音域 + 句间变化 + 句尾升降 |
| 清晰度 Clarity | 15 | 15 | 发音速率 + 软化词密度（自动） |
| 身体语言 Body | 5 | 15 | 画面动作幅度（自动） |
| 制作与镜头 Production | 20 | 5 | 分辨率/码率/曝光自动 + 构图滑杆 |

Two weight profiles: **对镜头** (talking to a webcam) and **讲台** (standing at a podium). Switching changes how many points body language and production are worth.

See [SCORING.md](SCORING.md) for every formula.

## How to run locally

It is a static site — no build step. Serve the folder over HTTP (files opened with `file://` cannot load the Web Worker):

```sh
python -m http.server 8792
# then open http://127.0.0.1:8792/
```

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/`.

`Pages` cannot set `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`, so
`SharedArrayBuffer` is unavailable and the WASM backend runs single-threaded per worker.
The app compensates by running several workers in parallel. If you are serving it
yourself behind a server you control, add those two headers to get multi-threaded WASM
and roughly 2× the speed.

## Models

Default `Xenova/whisper-tiny.en` for a quick look, `Xenova/whisper-base.en` for real use,
`Xenova/whisper-small.en` when accuracy matters. The model (~40–250 MB) is downloaded from
the Hugging Face CDN the first time and cached by the browser afterwards.

On a phone the app picks the base model and a single worker automatically.

## Known limits

- **Content and articulation are manual.** The automatic part cannot judge whether what you
  said was worth saying. Everything else is measured.
- **Rate numbers depend on the model.** `base.en` tends to hear about 7 % more words than
  `large-v3`, so articulation rate comes out ~10 % higher. Compare recordings made with the
  same model, not across models.
- **Very long videos** (over ~20 minutes) may run out of memory when the audio is decoded.
- Accents and non-native speech cost accuracy; the `.en` models do best on clear American
  English.

## Files

```
index.html          page shell
app.css             styles (dark/light, mobile)
js/audio.js         decode → mono 16 kHz, chunking
js/asr-worker.js    one Whisper worker (wasm, q8)
js/asr.js           worker pool, ordered merge
js/prosody.js       F0 tracking, sentences, pauses, fillers
js/video.js         resolution, bitrate, exposure, motion
js/score.js         the six dimensions and their weights
js/report.js        markdown report
js/app.js           wiring
```

## License

MIT
