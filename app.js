const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const timerEl = document.getElementById("timer");
const cameraBtn = document.getElementById("cameraBtn");
const liveVideo = document.getElementById("liveVideo");
const videoFallback = document.getElementById("videoFallback");
const logBody = document.getElementById("logBody");
const exportBtn = document.getElementById("exportBtn");
const tagButtons = Array.from(document.querySelectorAll(".tag"));
const pauseTagBtn = tagButtons.find((btn) => btn.dataset.tag === "Pause");

let running = false;
let startTime = 0;
let elapsedBefore = 0;
let rafId = null;
let events = [];
let stream = null;
let sessionStarted = false;
let mediaRecorder = null;
let recordingChunks = [];

function nowMs() {
  return performance.now();
}

function formatElapsed(ms) {
  const totalMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function currentElapsed() {
  return running ? elapsedBefore + (nowMs() - startTime) : elapsedBefore;
}

function renderTimer() {
  timerEl.textContent = formatElapsed(currentElapsed());
  if (running) {
    rafId = requestAnimationFrame(renderTimer);
  }
}

function setSessionState() {
  const paused = sessionStarted && !running;
  startBtn.disabled = sessionStarted;
  pauseBtn.disabled = !sessionStarted;
  stopBtn.disabled = !sessionStarted;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  if (pauseTagBtn) {
    pauseTagBtn.textContent = paused ? "Resume" : "Pause";
  }
}

function appendEvent(tag) {
  const elapsed = currentElapsed();
  const item = {
    index: events.length + 1,
    tag,
    elapsedMs: elapsed,
    elapsedLabel: formatElapsed(elapsed),
    timestampIso: new Date().toISOString(),
    timestampLocal: new Date().toLocaleString()
  };
  events.push(item);

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${item.index}</td>
    <td>${item.tag}</td>
    <td>${item.elapsedLabel}</td>
    <td>${item.timestampLocal}</td>
  `;
  logBody.prepend(tr);
}

function startSession() {
  if (running) return;
  const isResume = sessionStarted;
  if (elapsedBefore === 0 && events.length === 0) {
    appendEvent("Session Start");
  } else {
    appendEvent("Resume");
  }
  sessionStarted = true;
  running = true;
  startTime = nowMs();
  if (isResume && mediaRecorder) {
    if (mediaRecorder.state === "paused") {
      mediaRecorder.resume();
    } else if (mediaRecorder.state === "inactive") {
      startRecordingIfNeeded();
    }
  }
  setSessionState();
  cancelAnimationFrame(rafId);
  renderTimer();
}

function pauseSession(logPause = true) {
  if (!running) return;
  elapsedBefore = currentElapsed();
  running = false;
  cancelAnimationFrame(rafId);
  renderTimer();
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
  }
  if (logPause) appendEvent("Paused");
  setSessionState();
}

function stopSession() {
  if (!sessionStarted && elapsedBefore === 0 && events.length === 0) return;
  if (running) {
    elapsedBefore = currentElapsed();
    running = false;
    cancelAnimationFrame(rafId);
  }
  appendEvent("Session Stop");
  sessionStarted = false;
  setSessionState();
  renderTimer();
  finalizeRecordingDownload();
}

function resetSession() {
  running = false;
  startTime = 0;
  elapsedBefore = 0;
  sessionStarted = false;
  cancelAnimationFrame(rafId);
  renderTimer();
  setSessionState();
  events = [];
  logBody.innerHTML = "";
}

async function enableCamera() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    liveVideo.srcObject = stream;
    videoFallback.classList.add("hidden");
    cameraBtn.textContent = "Camera Active";
    cameraBtn.disabled = true;
    setupRecorder();
    if (sessionStarted) {
      startRecordingIfNeeded();
      if (!running && mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.pause();
      }
    }
  } catch {
    videoFallback.classList.remove("hidden");
    cameraBtn.textContent = "Camera Blocked";
  }
}

function setupRecorder() {
  if (!window.MediaRecorder || !stream) return;
  let mimeType = "video/webm;codecs=vp9";
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm;codecs=vp8";
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";

  mediaRecorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordingChunks.push(event.data);
    }
  };
}

function startRecordingIfNeeded() {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === "inactive") {
    recordingChunks = [];
    mediaRecorder.start();
  }
}

function finalizeRecordingDownload() {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === "paused") {
    mediaRecorder.resume();
  }
  if (mediaRecorder.state === "recording") {
    mediaRecorder.onstop = () => {
      if (recordingChunks.length === 0) return;
      const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `standard-work-video-${stamp}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    mediaRecorder.stop();
  }
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function normalizeCategory(tag) {
  if (tag === "Value Added" || tag === "Non-Value Added" || tag === "Waste" || tag === "Pause") {
    return tag;
  }
  return null;
}

function buildCategorySegments() {
  const totalMs = Math.max(0, Math.floor(currentElapsed()));
  const ordered = [...events].sort((a, b) => a.elapsedMs - b.elapsedMs || a.index - b.index);
  const segments = [];
  let currentCategory = null;
  let currentStartMs = null;

  for (const evt of ordered) {
    const category = normalizeCategory(evt.tag);
    if (!category) continue;

    if (currentCategory === null) {
      currentCategory = category;
      currentStartMs = evt.elapsedMs;
      continue;
    }

    if (category !== currentCategory) {
      const endMs = Math.max(currentStartMs, evt.elapsedMs);
      segments.push({
        index: segments.length + 1,
        category: currentCategory,
        startMs: currentStartMs,
        endMs,
        durationMs: endMs - currentStartMs,
        startLabel: formatElapsed(currentStartMs),
        endLabel: formatElapsed(endMs),
        durationLabel: formatElapsed(endMs - currentStartMs)
      });
      currentCategory = category;
      currentStartMs = evt.elapsedMs;
    }
  }

  if (currentCategory !== null && currentStartMs !== null && totalMs >= currentStartMs) {
    segments.push({
      index: segments.length + 1,
      category: currentCategory,
      startMs: currentStartMs,
      endMs: totalMs,
      durationMs: totalMs - currentStartMs,
      startLabel: formatElapsed(currentStartMs),
      endLabel: formatElapsed(totalMs),
      durationLabel: formatElapsed(totalMs - currentStartMs)
    });
  }

  return segments;
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  if (events.length === 0) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const rows = [
    ["Index", "Tag", "Elapsed", "Timestamp ISO"],
    ...events.map((e) => [e.index, e.tag, e.elapsedLabel, e.timestampIso])
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  triggerDownload(csv, `standard-work-events-${stamp}.csv`, "text/csv;charset=utf-8;");

  const segments = buildCategorySegments();
  if (segments.length > 0) {
    const segmentRows = [
      ["Segment", "Category", "Start", "End", "Duration", "StartMs", "EndMs", "DurationMs"],
      ...segments.map((s) => [
        s.index,
        s.category,
        s.startLabel,
        s.endLabel,
        s.durationLabel,
        s.startMs,
        s.endMs,
        s.durationMs
      ])
    ];
    const segmentCsv = segmentRows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const segmentJson = JSON.stringify({
      exportedAt: new Date().toISOString(),
      totalElapsedMs: Math.max(0, Math.floor(currentElapsed())),
      segments
    }, null, 2);

    triggerDownload(segmentCsv, `standard-work-segments-${stamp}.csv`, "text/csv;charset=utf-8;");
    triggerDownload(segmentJson, `standard-work-segments-${stamp}.json`, "application/json;charset=utf-8;");
  }
}

startBtn.addEventListener("click", () => {
  startSession();
  startRecordingIfNeeded();
});
pauseBtn.addEventListener("click", () => {
  if (running) {
    pauseSession(true);
  } else if (sessionStarted) {
    startSession();
  }
});
stopBtn.addEventListener("click", stopSession);
cameraBtn.addEventListener("click", enableCamera);
exportBtn.addEventListener("click", exportCsv);

tagButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tag = btn.dataset.tag;
    if (!tag) return;

    if (tag === "Pause") {
      if (running) {
        pauseSession(false);
        appendEvent("Pause");
      } else if (sessionStarted) {
        startSession();
      } else {
        appendEvent("Pause Marker");
      }
      return;
    }

    if (!running && (elapsedBefore > 0 || events.length > 0)) {
      appendEvent(`${tag} (while paused)`);
      return;
    }

    appendEvent(tag);
  });
});

window.addEventListener("beforeunload", () => {
  finalizeRecordingDownload();
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
});

setSessionState();
renderTimer();
