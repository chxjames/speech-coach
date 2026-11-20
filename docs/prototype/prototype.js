import {
  FilesetResolver,
  PoseLandmarker,
  FaceLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MAX_FRAMES = 180;

const $ = (id) => document.getElementById(id);
const state = {
  file: null,
  url: null,
  pose: null,
  face: null,
  result: null,
  running: false,
};

const els = {
  drop: $("drop"),
  file: $("file"),
  pick: $("pick"),
  panel: $("panel"),
  video: $("video"),
  fileinfo: $("fileinfo"),
  analyze: $("analyze"),
  reset: $("reset"),
  progress: $("progress"),
  barfill: $("barfill"),
  status: $("status"),
  results: $("results"),
  summary: $("summary"),
  warnings: $("warnings"),
  canvas: $("canvas"),
  download: $("download"),
};

window.__protoErrors = [];
window.addEventListener("error", (e) => {
  window.__protoErrors.push(String(e.message || e.error || "error"));
});
window.addEventListener("unhandledrejection", (e) => {
  window.__protoErrors.push(String(e.reason || "rejection"));
});

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("err", isError);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

const fmt = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : "–");
const fmtPct = (v, digits = 0) => (Number.isFinite(v) ? `${v.toFixed(digits)}%` : "–");
const fmtDeg = (v, digits = 1) => (Number.isFinite(v) ? `${v.toFixed(digits)}°` : "–");

function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    setStatus("请选择视频文件（mp4 / mov / webm）。", true);
    return;
  }
  if (state.url) URL.revokeObjectURL(state.url);
  state.file = file;
  state.url = URL.createObjectURL(file);
  state.result = null;

  els.video.onloadedmetadata = () => {
    els.drop.classList.add("hidden");
    els.fileinfo.textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB · ${fmtTime(els.video.duration)}`;
    els.analyze.disabled = false;
    setStatus("视频已载入。点“开始分析”。");
  };
  els.video.onerror = () => {
    els.analyze.disabled = true;
    setStatus("浏览器读不了这个视频。换 mp4（H.264）试试。", true);
  };
  els.video.src = state.url;
  els.video.load();

  els.panel.classList.remove("hidden");
  els.results.classList.add("hidden");
  els.analyze.disabled = true;
  els.analyze.textContent = "开始分析";
  els.reset.hidden = true;
  els.progress.hidden = true;
  els.barfill.style.width = "0%";
  setStatus("视频载入中…");
}

els.pick.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", () => loadFile(els.file.files[0]));
els.drop.addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  els.file.click();
});
els.drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.drop.classList.add("over");
});
els.drop.addEventListener("dragleave", () => els.drop.classList.remove("over"));
els.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  els.drop.classList.remove("over");
  loadFile(e.dataTransfer.files[0]);
});

async function makePair(vision, delegate) {
  const pose = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  try {
    const face = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });
    return { pose, face };
  } catch (e) {
    pose.close();
    throw e;
  }
}

async function createModels() {
  let lastError = null;
  for (const useModule of [false, true]) {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE, useModule);
      try {
        return await makePair(vision, "GPU");
      } catch (e) {
        console.warn("MediaPipe GPU delegate failed; retrying CPU.", e);
        return await makePair(vision, "CPU");
      }
    } catch (e) {
      lastError = e;
      console.warn(`MediaPipe module=${useModule} failed.`, e);
    }
  }
  throw lastError || new Error("MediaPipe 模型加载失败。");
}

async function ensureModels() {
  if (state.pose && state.face) return;
  setStatus("正在下载并加载 MediaPipe 模型（约 9 MB，只需一次）…");
  const models = await createModels();
  state.pose = models.pose;
  state.face = models.face;
}

function seek(video, t) {
  return new Promise((resolve, reject) => {
    const target = Math.min(Math.max(t, 0), Math.max(0, video.duration - 0.05));
    if (Math.abs(video.currentTime - target) < 0.002) {
      resolve();
      return;
    }
    let done = false;
    let timer = null;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      err ? reject(err) : resolve();
    };
    const onSeeked = () => setTimeout(() => finish(), 20);
    const onError = () => finish(new Error("视频跳转失败"));
    timer = setTimeout(() => finish(), 2500);
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = target;
  });
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clonePoint = (p) => (p ? { x: p.x, y: p.y } : null);
const visible = (lms, i, min = 0.5) => Boolean(lms[i]) && (lms[i].visibility ?? 0) >= min;

function median(values) {
  if (!values.length) return NaN;
  const a = values.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function percentile(values, p) {
  if (!values.length) return NaN;
  const a = values.slice().sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))));
  return a[idx];
}

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN;
}

function std(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

function countPeaks(points, threshold, refractory) {
  let n = 0;
  let last = -Infinity;
  for (const p of points) {
    if (p.v >= threshold && p.t - last >= refractory) {
      n += 1;
      last = p.t;
    }
  }
  return n;
}

const POSE_LINKS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];

const FACE_LINKS = [
  ...(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL || []),
  ...(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE || []),
  ...(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE || []),
  ...(FaceLandmarker.FACE_LANDMARKS_LIPS || []),
];

function drawPose(ctx, lms, w, h) {
  ctx.save();
  ctx.lineWidth = Math.max(2, w / 360);
  ctx.strokeStyle = "rgba(76, 141, 255, .95)";
  ctx.fillStyle = "rgba(255, 255, 255, .95)";
  for (const [a, b] of POSE_LINKS) {
    if (!lms[a] || !lms[b] || (lms[a].visibility ?? 0) < 0.5 || (lms[b].visibility ?? 0) < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(lms[a].x * w, lms[a].y * h);
    ctx.lineTo(lms[b].x * w, lms[b].y * h);
    ctx.stroke();
  }
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24]) {
    const p = lms[i];
    if (!p || (p.visibility ?? 0) < 0.5) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(2.5, w / 260), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFace(ctx, lms, w, h) {
  ctx.save();
  ctx.lineWidth = Math.max(1, w / 640);
  ctx.strokeStyle = "rgba(244, 114, 182, .85)";
  ctx.fillStyle = "rgba(244, 114, 182, .9)";
  for (const c of FACE_LINKS) {
    const a = lms[c.start];
    const b = lms[c.end];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }
  for (const i of [468, 473]) {
    const p = lms[i];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(1.5, w / 500), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

async function analyze() {
  if (state.running || !state.file) return;
  state.running = true;
  els.analyze.disabled = true;
  els.analyze.textContent = "分析中…";
  els.reset.hidden = true;
  els.results.classList.add("hidden");
  els.progress.hidden = false;
  els.barfill.style.width = "0%";
  window.__protoErrors = [];

  try {
    await ensureModels();
    const video = els.video;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < 1) throw new Error("读不到视频时长。");

    const step = Math.max(0.5, duration / MAX_FRAMES);
    const times = [];
    for (let t = Math.min(0.1, duration / 3); t < duration - 0.05; t += step) times.push(t);
    if (!times.length) times.push(0);
    const total = times.length;
    const fps = 1 / step;

    const canvas = els.canvas;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 canvas。");

    const rec = {
      wristSpeed: [],
      sway: [],
      lean: [],
      shoulderTilt: [],
      handAbove: [],
      poseSizes: [],
      faceSizes: [],
      smile: [],
      brow: [],
      jaw: [],
      blink: [],
      yaw: [],
      pitch: [],
      roll: [],
    };
    let prev = null;
    let lastTs = -1;
    let poseCount = 0;
    let faceCount = 0;
    let blinkCount = 0;
    let prevBlink = 0;

    setStatus(`分析中… 0/${total} 帧`);

    for (let i = 0; i < total; i += 1) {
      const t = times[i];
      try {
        await seek(video, t);
      } catch (e) {
        window.__protoErrors.push(`seek ${t}: ${e.message}`);
      }

      const ts = Math.max(lastTs + 1, Math.round(t * 1000));
      lastTs = ts;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let poseLms = null;
      let faceLms = null;
      let blends = null;

      try {
        const pr = state.pose.detectForVideo(video, ts);
        poseLms = pr.landmarks && pr.landmarks[0] ? pr.landmarks[0] : null;
      } catch (e) {
        window.__protoErrors.push(`pose ${i}: ${e.message}`);
      }

      try {
        const fr = state.face.detectForVideo(video, ts);
        faceLms = fr.faceLandmarks && fr.faceLandmarks[0] ? fr.faceLandmarks[0] : null;
        blends = fr.faceBlendshapes && fr.faceBlendshapes[0] ? fr.faceBlendshapes[0].categories : null;
      } catch (e) {
        window.__protoErrors.push(`face ${i}: ${e.message}`);
      }

      if (poseLms && visible(poseLms, 11) && visible(poseLms, 12)) {
        const ls = poseLms[11];
        const rs = poseLms[12];
        const shoulderWidth = dist(ls, rs);
        if (shoulderWidth >= 0.05) {
          poseCount += 1;
          rec.poseSizes.push(shoulderWidth);
          const wristL = visible(poseLms, 15) ? clonePoint(poseLms[15]) : null;
          const wristR = visible(poseLms, 16) ? clonePoint(poseLms[16]) : null;
          const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };

          if (visible(poseLms, 23) && visible(poseLms, 24)) {
            const hipMid = mid(poseLms[23], poseLms[24]);
            rec.lean.push(Math.abs(shoulderMid.x - hipMid.x) / shoulderWidth);
          }

          let shoulderTilt = Math.abs(Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180 / Math.PI);
          if (shoulderTilt > 90) shoulderTilt = 180 - shoulderTilt;
          rec.shoulderTilt.push(shoulderTilt);
          rec.handAbove.push(
            wristL && wristL.y < shoulderMid.y ? 1 : wristR && wristR.y < shoulderMid.y ? 1 : 0,
          );

          if (prev && t > prev.t) {
            const dt = t - prev.t;
            let hadWrist = false;
            let speed = 0;
            if (wristL && prev.wristL) {
              hadWrist = true;
              speed = Math.max(speed, dist(wristL, prev.wristL) / dt / shoulderWidth);
            }
            if (wristR && prev.wristR) {
              hadWrist = true;
              speed = Math.max(speed, dist(wristR, prev.wristR) / dt / shoulderWidth);
            }
            if (hadWrist) rec.wristSpeed.push({ t, v: speed });
            rec.sway.push(dist(shoulderMid, prev.shoulderMid) / dt / shoulderWidth);
          }

          prev = {
            t,
            wristL,
            wristR,
            shoulderMid,
            shoulderWidth,
          };
        }
      } else {
        prev = null;
      }

      if (faceLms && faceLms.length >= 468) {
        const faceWidth = dist(faceLms[234], faceLms[454]);
        if (faceWidth >= 0.08) {
          faceCount += 1;
          rec.faceSizes.push(faceWidth);
          const leftEye = faceLms[33];
          const rightEye = faceLms[263];
          const nose = faceLms[1];
          const forehead = faceLms[10];
          const chin = faceLms[152];
          const eyeDist = dist(leftEye, rightEye);
          const faceHeight = dist(forehead, chin);
          if (eyeDist > 0.001 && faceHeight > 0.001) {
            const eyeMid = mid(leftEye, rightEye);
            rec.yaw.push(((nose.x - eyeMid.x) / eyeDist) * 100);
            rec.pitch.push(((nose.y - eyeMid.y) / faceHeight) * 100);
            rec.roll.push(
              Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI,
            );
          }

          if (blends) {
            const bs = new Map(blends.map((c) => [c.categoryName, c.score]));
            const smile = ((bs.get("mouthSmileLeft") || 0) + (bs.get("mouthSmileRight") || 0)) / 2;
            const brow =
              ((bs.get("browInnerUp") || 0) +
                (bs.get("browOuterUpLeft") || 0) +
                (bs.get("browOuterUpRight") || 0)) /
              3;
            const jaw = bs.get("jawOpen") || 0;
            const blink = ((bs.get("eyeBlinkLeft") || 0) + (bs.get("eyeBlinkRight") || 0)) / 2;
            rec.smile.push(smile);
            rec.brow.push(brow);
            rec.jaw.push(jaw);
            rec.blink.push(blink);
            if (prevBlink <= 0.5 && blink > 0.5) blinkCount += 1;
            prevBlink = blink;
          }
        }

        drawFace(ctx, faceLms, canvas.width, canvas.height);
      }

      if (poseLms) drawPose(ctx, poseLms, canvas.width, canvas.height);

      if (i % 5 === 0 || i === total - 1) {
        els.barfill.style.width = `${((i + 1) / total) * 100}%`;
        setStatus(`分析中… ${i + 1}/${total} 帧`);
      }
    }

    const poseRate = (poseCount / total) * 100;
    const faceRate = (faceCount / total) * 100;
    const poseSizeMed = median(rec.poseSizes);
    const faceSizeMed = median(rec.faceSizes);
    const poseUsable = poseRate >= 50 && (!Number.isFinite(poseSizeMed) || poseSizeMed >= 0.05);
    const faceUsable = faceRate >= 50 && (!Number.isFinite(faceSizeMed) || faceSizeMed >= 0.08);

    const speedVals = rec.wristSpeed.map((p) => p.v);
    const hasWristData = rec.wristSpeed.length > 0;
    const gestureAmp = poseUsable && hasWristData ? median(speedVals) : NaN;
    const gestureP90 = poseUsable && hasWristData ? percentile(speedVals, 90) : NaN;
    const gestureRate =
      poseUsable && hasWristData ? countPeaks(rec.wristSpeed, 0.6, 0.4) / (duration / 60) : NaN;
    const swayMed = poseUsable ? median(rec.sway) : NaN;
    const leanMed = poseUsable ? median(rec.lean) * 100 : NaN;
    const tiltMed = poseUsable ? median(rec.shoulderTilt) : NaN;
    const handShare = poseUsable && hasWristData ? mean(rec.handAbove) * 100 : NaN;
    const smileMed = faceUsable ? median(rec.smile) * 100 : NaN;
    const smileShare = faceUsable ? mean(rec.smile.map((v) => (v > 0.25 ? 1 : 0))) * 100 : NaN;
    const browMed = faceUsable ? median(rec.brow) * 100 : NaN;
    const jawMed = faceUsable ? median(rec.jaw) * 100 : NaN;
    const blinkRate = faceUsable ? blinkCount / (duration / 60) : NaN;
    const yawAbs = faceUsable ? median(rec.yaw.map((v) => Math.abs(v))) : NaN;
    const pitchMed = faceUsable ? median(rec.pitch) : NaN;
    const pitchAbs = faceUsable ? median(rec.pitch.map((v) => Math.abs(v - pitchMed))) : NaN;
    const rollAbs = faceUsable ? median(rec.roll.map((v) => Math.abs(v))) : NaN;
    const facing = faceUsable
      ? mean(
          rec.yaw.map((y, i) =>
            Math.abs(y) < 10 &&
            Math.abs(rec.pitch[i] - pitchMed) < 8 &&
            Math.abs(rec.roll[i]) < 10
              ? 1
              : 0,
          ),
        ) * 100
      : NaN;
    const smileSD = faceUsable ? std(rec.smile) * 100 : NaN;

    const warnings = [];
    if (poseRate < 50 && faceRate < 50) {
      warnings.push("人物在画面里太小，或这不是单人口播（例如屏幕录制、多人缩略图）。原型只适合人物占画面较大的口播/演讲视频。");
    } else {
      if (poseRate < 50) warnings.push("人体检测率低：人物可能太小、被遮挡或侧身。动作指标只作参考。");
      if (faceRate < 50) warnings.push("人脸检测率低：脸太小、侧脸或被遮挡。神情指标只作参考。");
    }
    if (Number.isFinite(poseSizeMed) && poseSizeMed < 0.05) {
      warnings.push("人物在画面里太小：肩宽不到画面宽度的 5%。请让人物占画面更大，或把镜头拉近。");
    }
    if (Number.isFinite(faceSizeMed) && faceSizeMed < 0.08) {
      warnings.push("人脸太小：脸宽不到画面宽度的 8%。请让人物占画面更大，或把镜头拉近。");
    }
    if (poseUsable && !hasWristData) {
      warnings.push("肩膀能看到，但手腕一直在画面外（例如手放在桌下）。手势幅度、手势次数和“手高于肩”无法计算。");
    }

    state.result = {
      file: state.file.name,
      duration,
      sampledFrames: total,
      fps,
      framesWithPose: poseCount,
      framesWithFace: faceCount,
      poseRate,
      faceRate,
      poseSize: poseSizeMed,
      faceSize: faceSizeMed,
      poseUsable,
      faceUsable,
      warnings,
      gestureAmplitude: gestureAmp,
      gestureP90,
      gestureRate,
      sway: swayMed,
      leanPct: leanMed,
      handAboveShare: handShare,
      shoulderTiltDeg: tiltMed,
      smile: smileMed,
      smileShare,
      brow: browMed,
      jaw: jawMed,
      blinkRate,
      yawPct: yawAbs,
      pitchPct: pitchAbs,
      rollDeg: rollAbs,
      cameraFacingShare: facing,
      smileSD,
      errors: window.__protoErrors.slice(),
    };

    els.summary.textContent = `${state.file.name} · ${fmtTime(duration)} · ${total} 个采样帧（约 ${fps.toFixed(2)} fps）`;

    els.warnings.innerHTML = "";
    if (warnings.length) {
      const ul = document.createElement("ul");
      for (const warning of warnings) {
        const li = document.createElement("li");
        li.textContent = warning;
        ul.appendChild(li);
      }
      els.warnings.appendChild(ul);
      els.warnings.classList.remove("hidden");
    } else {
      els.warnings.classList.add("hidden");
    }

    setText("pose-rate", fmtPct(poseRate, 0));
    setText("gesture-amp", fmt(gestureAmp, 2));
    setText("gesture-rate", fmt(gestureRate, 1));
    setText("sway", fmt(swayMed, 2));
    setText("lean", fmtPct(leanMed, 1));
    setText("hand-above", fmtPct(handShare, 0));
    setText("shoulder-tilt", fmtDeg(tiltMed, 1));
    setText("face-rate", fmtPct(faceRate, 0));
    setText("smile", fmt(smileMed, 0));
    setText("smile-share", fmtPct(smileShare, 0));
    setText("brow", fmt(browMed, 0));
    setText("jaw", fmt(jawMed, 0));
    setText("blink", fmt(blinkRate, 1));
    setText("yaw", fmtPct(yawAbs, 1));
    setText("pitch", fmtPct(pitchAbs, 1));
    setText("roll", fmtDeg(rollAbs, 1));
    setText("facing", fmtPct(facing, 0));
    setText("expr-var", fmt(smileSD, 1));

    els.results.classList.remove("hidden");
    els.progress.hidden = true;
    els.analyze.disabled = false;
    els.analyze.textContent = "重新分析";
    els.reset.hidden = false;

    if (poseCount === 0 && faceCount === 0) {
      setStatus("完成，但没有检测到人体或人脸。看看人物是不是太小、太暗，或换一个视频。", true);
    } else {
      setStatus("完成。");
    }
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.error(e);
    setStatus(`失败：${e.message || e}`, true);
    els.analyze.disabled = false;
    els.analyze.textContent = "重试";
  } finally {
    state.running = false;
  }
}

els.analyze.addEventListener("click", analyze);

els.reset.addEventListener("click", () => {
  if (state.running) return;
  if (state.url) URL.revokeObjectURL(state.url);
  state.file = null;
  state.url = null;
  state.result = null;
  els.file.value = "";
  els.video.removeAttribute("src");
  els.video.load();
  els.panel.classList.add("hidden");
  els.drop.classList.remove("hidden");
  els.results.classList.add("hidden");
  els.analyze.disabled = true;
  els.analyze.textContent = "开始分析";
  els.reset.hidden = true;
  els.progress.hidden = true;
  els.barfill.style.width = "0%";
  setStatus("先选择视频。");
});

els.download.addEventListener("click", () => {
  if (!state.result) return;
  const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "motion-prototype.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

setStatus("先选择视频。");
