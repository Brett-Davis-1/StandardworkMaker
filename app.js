const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const timerEl = document.getElementById("timer");
const cameraBtn = document.getElementById("cameraBtn");
const videoWrap = document.getElementById("videoWrap");
const liveVideo = document.getElementById("liveVideo");
const videoFallback = document.getElementById("videoFallback");
const processBody = document.getElementById("processBody");
const exportBtn = document.getElementById("exportBtn");
const processImageBtn = document.getElementById("processImageBtn");
const nextProcessBtn = document.getElementById("nextProcessBtn");
const processNameInput = document.getElementById("processNameInput");
const currentProcessEl = document.getElementById("currentProcess");
const cameraApp = document.querySelector(".camera-app");
const captureToast = document.getElementById("captureToast");
const captureToastTitle = document.getElementById("captureToastTitle");
const captureToastDetail = document.getElementById("captureToastDetail");

let running = false;
let startTime = 0;
let elapsedBefore = 0;
let rafId = null;
let stream = null;
let sessionStarted = false;
let mediaRecorder = null;
let recordingChunks = [];
let recordedVideoBlob = null;
let recordingStopPromise = Promise.resolve();
let resolveRecordingStop = null;
let processes = [];
let currentProcess = null;
let toastTimer = null;

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
  if (running) rafId = requestAnimationFrame(renderTimer);
}

function defaultProcessLabel(index) {
  return `Process ${index}`;
}

function currentProcessLabel() {
  if (!currentProcess) {
    return processes.length === 0 ? defaultProcessLabel(1) : "No active process";
  }
  return currentProcess.name.trim() || defaultProcessLabel(currentProcess.index);
}

function setProcessLabel() {
  currentProcessEl.textContent = currentProcessLabel();
}

function renderProcesses() {
  processBody.innerHTML = "";
  if (processes.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="empty-state">No processes captured yet.</td>`;
    processBody.appendChild(tr);
    return;
  }

  processes.forEach((process) => {
    const tr = document.createElement("tr");
    if (process === currentProcess) tr.classList.add("current-row");
    const displayName = process.name.trim() || defaultProcessLabel(process.index);
    const screenshotLabel = process.screenshotFileName || "No screenshot";
    const previewCell = process.screenshotDataUrl
      ? `<button class="thumb-button" type="button" aria-label="Open screenshot for ${displayName}"><img src="${process.screenshotDataUrl}" alt="Screenshot for ${displayName}" /></button>`
      : `<span class="empty-cell">No preview</span>`;

    tr.innerHTML = `
      <td>${process.index}</td>
      <td title="${process.startedAtIso}">${process.startedAtLocal}</td>
      <td>${displayName}</td>
      <td>${screenshotLabel}</td>
      <td>${previewCell}</td>
    `;

    const thumbButton = tr.querySelector(".thumb-button");
    if (thumbButton && process.screenshotDataUrl) {
      thumbButton.addEventListener("click", () => {
        const win = window.open(process.screenshotDataUrl, "_blank", "noopener,noreferrer");
        if (win) win.opener = null;
      });
    }
    processBody.appendChild(tr);
  });
}

function createProcessRecord() {
  const startedAt = new Date();
  return {
    index: processes.length + 1,
    startedAtIso: startedAt.toISOString(),
    startedAtLocal: startedAt.toLocaleString(),
    startedElapsedMs: Math.max(0, Math.floor(currentElapsed())),
    name: "",
    screenshotDataUrl: "",
    screenshotTakenAtIso: "",
    screenshotTakenAtLocal: "",
    screenshotFileName: ""
  };
}

function screenshotFileNameFor(process) {
  const label = (process.name.trim() || defaultProcessLabel(process.index))
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const capturedStamp = process.screenshotTakenAtIso
    ? process.screenshotTakenAtIso.replace(/[:.]/g, "-")
    : new Date().toISOString().replace(/[:.]/g, "-");
  return `lineflow-process-${String(process.index).padStart(2, "0")}-${label}-${capturedStamp}.jpg`;
}

function setSessionState() {
  const paused = sessionStarted && !running;
  cameraApp.classList.toggle("is-active", sessionStarted);
  cameraApp.classList.toggle("is-running", running);
  document.body.classList.toggle("study-active", sessionStarted);
  startBtn.disabled = sessionStarted;
  pauseBtn.disabled = !sessionStarted;
  stopBtn.disabled = !sessionStarted;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  processImageBtn.disabled = !sessionStarted || !stream || !currentProcess;
  nextProcessBtn.disabled = !sessionStarted || !currentProcess;
  exportBtn.disabled = processes.length === 0 || sessionStarted;
  processNameInput.disabled = !sessionStarted || !currentProcess;
  processNameInput.value = currentProcess ? currentProcess.name : "";
  processNameInput.placeholder = currentProcess
    ? `Enter ${defaultProcessLabel(currentProcess.index)} name`
    : "Start a study to name the process";
}

function showNamePanel() {
  if (!currentProcess) return;
  processNameInput.value = currentProcess.name;
  processNameInput.placeholder = `e.g. ${defaultProcessLabel(currentProcess.index)}`;
  processNameInput.focus();
  processNameInput.select();
}

function startCurrentProcess() {
  currentProcess = createProcessRecord();
  processes.push(currentProcess);
  setProcessLabel();
  renderProcesses();
  setSessionState();
}

function startSession() {
  if (running) return;
  startBtn.blur();
  const isResume = sessionStarted;
  sessionStarted = true;
  running = true;
  startTime = nowMs();

  if (!currentProcess) {
    recordedVideoBlob = null;
    recordingChunks = [];
    startCurrentProcess();
  }

  if (isResume && mediaRecorder) {
    if (mediaRecorder.state === "paused") mediaRecorder.resume();
    else if (mediaRecorder.state === "inactive") startRecordingIfNeeded();
  }

  setSessionState();
  cancelAnimationFrame(rafId);
  renderTimer();
  window.scrollTo(0, 0);
}

function pauseSession() {
  if (!running) return;
  elapsedBefore = currentElapsed();
  running = false;
  cancelAnimationFrame(rafId);
  renderTimer();
  if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.pause();
  setSessionState();
}

function stopSession() {
  if (!sessionStarted && elapsedBefore === 0 && processes.length === 0) return;
  if (running) {
    elapsedBefore = currentElapsed();
    running = false;
    cancelAnimationFrame(rafId);
  }
  sessionStarted = false;
  currentProcess = null;
  setProcessLabel();
  setSessionState();
  renderProcesses();
  renderTimer();
  window.scrollTo(0, 0);
  finalizeRecording();
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
      if (!running && mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.pause();
    }
    setSessionState();
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
    if (event.data && event.data.size > 0) recordingChunks.push(event.data);
  };

  mediaRecorder.onstop = () => {
    recordedVideoBlob = recordingChunks.length
      ? new Blob(recordingChunks, { type: mediaRecorder.mimeType || "video/webm" })
      : null;
    if (resolveRecordingStop) {
      resolveRecordingStop(recordedVideoBlob);
      resolveRecordingStop = null;
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

function finalizeRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    return Promise.resolve(recordedVideoBlob);
  }
  if (mediaRecorder.state === "paused") mediaRecorder.resume();
  recordingStopPromise = new Promise((resolve) => {
    resolveRecordingStop = resolve;
  });
  mediaRecorder.stop();
  return recordingStopPromise;
}

function captureProcessImage() {
  if (!stream || liveVideo.readyState < 2 || !currentProcess) return;
  const width = liveVideo.videoWidth || 1280;
  const height = liveVideo.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(liveVideo, 0, 0, width, height);
  const capturedAt = new Date();
  currentProcess.screenshotDataUrl = canvas.toDataURL("image/jpeg", 0.9);
  currentProcess.screenshotTakenAtIso = capturedAt.toISOString();
  currentProcess.screenshotTakenAtLocal = capturedAt.toLocaleString();
  currentProcess.screenshotFileName = screenshotFileNameFor(currentProcess);
  renderProcesses();
  setSessionState();
  showCaptureFeedback(currentProcess);
}

function showCaptureFeedback(process) {
  if (navigator.vibrate) navigator.vibrate([18, 35, 18]);
  videoWrap.classList.remove("capture-flash");
  void videoWrap.offsetWidth;
  videoWrap.classList.add("capture-flash");
  captureToastTitle.textContent = "Snapshot captured";
  captureToastDetail.textContent = `${process.name.trim() || defaultProcessLabel(process.index)} saved as JPG`;
  captureToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => captureToast.classList.remove("show"), 2200);
}

function commitProcessName() {
  if (!currentProcess) return;
  currentProcess.name = processNameInput.value.trim();
  if (currentProcess.screenshotDataUrl) {
    currentProcess.screenshotFileName = screenshotFileNameFor(currentProcess);
  }
  setProcessLabel();
  renderProcesses();
}

function nextProcess() {
  if (!sessionStarted || !currentProcess) return;
  commitProcessName();
  startCurrentProcess();
  showNamePanel();
}

function csvEscape(value) {
  const str = String(value ?? "");
  return /[,"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildCsv() {
  const rows = [
    [
      "Process #", "Started At Local", "Started At ISO", "Name",
      "Started Elapsed", "Duration", "Duration Seconds", "Screenshot Taken",
      "Screenshot File", "Screenshot Captured At Local", "Screenshot Captured At ISO"
    ],
    ...processes.map((process, index) => {
      const nextStart = processes[index + 1]?.startedElapsedMs ?? elapsedBefore;
      const durationMs = Math.max(0, nextStart - process.startedElapsedMs);
      return [
        process.index,
        process.startedAtLocal,
        process.startedAtIso,
        process.name,
        formatElapsed(process.startedElapsedMs),
        formatElapsed(durationMs),
        (durationMs / 1000).toFixed(3),
        process.screenshotDataUrl ? "Yes" : "No",
        process.screenshotFileName,
        process.screenshotTakenAtLocal,
        process.screenshotTakenAtIso
      ];
    })
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function exportStudy() {
  if (processes.length === 0) return;
  if (sessionStarted) {
    captureToastTitle.textContent = "Stop the study first";
    captureToastDetail.textContent = "Then export the complete study package";
    captureToast.classList.add("show");
    return;
  }
  if (typeof JSZip === "undefined") {
    captureToastTitle.textContent = "Export unavailable";
    captureToastDetail.textContent = "Reload the page and try again";
    captureToast.classList.add("show");
    return;
  }

  exportBtn.disabled = true;
  exportBtn.textContent = "Preparing…";
  captureToastTitle.textContent = "Building study package";
  captureToastDetail.textContent = "Large videos may take a moment";
  captureToast.classList.add("show");

  try {
    await recordingStopPromise;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const zip = new JSZip();
    zip.file(`standard-work-processes-${stamp}.csv`, buildCsv());

    const imagesFolder = zip.folder("images");
    processes.filter((process) => process.screenshotDataUrl).forEach((process) => {
      const base64 = process.screenshotDataUrl.split(",")[1];
      if (base64) {
        imagesFolder.file(screenshotFileNameFor(process), base64, { base64: true });
      }
    });

    if (recordedVideoBlob) {
      zip.file(`standard-work-video-${stamp}.webm`, recordedVideoBlob);
    }

    const archive = await zip.generateAsync({
      type: "blob",
      compression: "STORE",
      streamFiles: true
    });
    triggerDownload(archive, `lineflow-study-${stamp}.zip`, "application/zip");
    captureToastTitle.textContent = "Study package exported";
    captureToastDetail.textContent = "CSV, images, and video saved in one ZIP";
  } catch (error) {
    console.error("Study export failed", error);
    captureToastTitle.textContent = "Export failed";
    captureToastDetail.textContent = "Keep this page open and try again";
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = "Export Study";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => captureToast.classList.remove("show"), 3500);
  }
}

function triggerDownload(content, filename, mimeType) {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

startBtn.addEventListener("click", () => {
  startSession();
  startRecordingIfNeeded();
});
pauseBtn.addEventListener("click", () => {
  if (running) pauseSession();
  else if (sessionStarted) startSession();
});
stopBtn.addEventListener("click", stopSession);
cameraBtn.addEventListener("click", enableCamera);
exportBtn.addEventListener("click", exportStudy);
processImageBtn.addEventListener("click", captureProcessImage);
nextProcessBtn.addEventListener("click", nextProcess);
processNameInput.addEventListener("input", () => {
  if (!currentProcess) return;
  currentProcess.name = processNameInput.value.trim();
  if (currentProcess.screenshotDataUrl) {
    currentProcess.screenshotFileName = screenshotFileNameFor(currentProcess);
  }
  setProcessLabel();
  renderProcesses();
});
processNameInput.addEventListener("blur", commitProcessName);
processNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitProcessName();
  }
});
window.addEventListener("beforeunload", () => {
  finalizeRecording();
  if (stream) stream.getTracks().forEach((track) => track.stop());
});

setProcessLabel();
setSessionState();
renderTimer();
renderProcesses();
