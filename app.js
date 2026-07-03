const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const timerEl = document.getElementById("timer");
const cameraBtn = document.getElementById("cameraBtn");
const liveVideo = document.getElementById("liveVideo");
const videoFallback = document.getElementById("videoFallback");
const processBody = document.getElementById("processBody");
const exportBtn = document.getElementById("exportBtn");
const processImageBtn = document.getElementById("processImageBtn");
const nameProcessBtn = document.getElementById("nameProcessBtn");
const nextProcessBtn = document.getElementById("nextProcessBtn");
const nameProcessPanel = document.getElementById("nameProcessPanel");
const processNameInput = document.getElementById("processNameInput");
const saveProcessNameBtn = document.getElementById("saveProcessName");
const cancelProcessNameBtn = document.getElementById("cancelProcessName");
const currentProcessEl = document.getElementById("currentProcess");

let running = false;
let startTime = 0;
let elapsedBefore = 0;
let rafId = null;
let stream = null;
let sessionStarted = false;
let mediaRecorder = null;
let recordingChunks = [];
let processes = [];
let currentProcess = null;

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

function defaultProcessLabel(index) {
  return `Process ${index}`;
}

function currentProcessLabel() {
  if (!currentProcess) {
    return processes.length === 0 ? defaultProcessLabel(1) : "No active process";
  }

  const name = currentProcess.name.trim();
  return name || defaultProcessLabel(currentProcess.index);
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
    if (process === currentProcess) {
      tr.classList.add("current-row");
    }

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

function setSessionState() {
  const paused = sessionStarted && !running;
  startBtn.disabled = sessionStarted;
  pauseBtn.disabled = !sessionStarted;
  stopBtn.disabled = !sessionStarted;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  processImageBtn.disabled = !sessionStarted || !stream || !currentProcess;
  nameProcessBtn.disabled = !sessionStarted || !currentProcess;
  nextProcessBtn.disabled = !sessionStarted || !currentProcess;

  if (sessionStarted) {
    videoFallback.classList.add("hidden");
  }

  if (!sessionStarted) {
    hideNamePanel();
  }
}

function hideNamePanel() {
  nameProcessPanel.classList.add("hidden");
}

function showNamePanel() {
  if (!currentProcess) {
    return;
  }

  processNameInput.value = currentProcess.name;
  processNameInput.placeholder = `e.g. ${defaultProcessLabel(currentProcess.index)}`;
  nameProcessPanel.classList.remove("hidden");
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

  const isResume = sessionStarted;
  sessionStarted = true;
  running = true;
  startTime = nowMs();

  if (!currentProcess) {
    startCurrentProcess();
  }

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

function pauseSession() {
  if (!running) return;
  elapsedBefore = currentElapsed();
  running = false;
  cancelAnimationFrame(rafId);
  renderTimer();
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
  }
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
  hideNamePanel();
  setProcessLabel();
  setSessionState();
  renderProcesses();
  renderTimer();
  finalizeRecordingDownload();
}

function resetSession() {
  running = false;
  startTime = 0;
  elapsedBefore = 0;
  sessionStarted = false;
  currentProcess = null;
  cancelAnimationFrame(rafId);
  renderTimer();
  setProcessLabel();
  setSessionState();
  hideNamePanel();
  processes = [];
  processBody.innerHTML = "";
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

function captureProcessImage() {
  if (!stream || liveVideo.readyState < 2 || !currentProcess) {
    return;
  }

  const width = liveVideo.videoWidth || 1280;
  const height = liveVideo.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(liveVideo, 0, 0, width, height);
  const imageUrl = canvas.toDataURL("image/jpeg", 0.9);
  const capturedAt = new Date();
  const stamp = capturedAt.toISOString().replace(/[:.]/g, "-");

  currentProcess.screenshotDataUrl = imageUrl;
  currentProcess.screenshotTakenAtIso = capturedAt.toISOString();
  currentProcess.screenshotTakenAtLocal = capturedAt.toLocaleString();
  currentProcess.screenshotFileName = `process-${String(currentProcess.index).padStart(2, "0")}-screenshot-${stamp}.jpg`;
  renderProcesses();
}

function commitProcessName() {
  if (!currentProcess) {
    return;
  }

  currentProcess.name = processNameInput.value.trim();
  setProcessLabel();
  renderProcesses();
  hideNamePanel();
}

function nextProcess() {
  if (!sessionStarted || !currentProcess) {
    return;
  }

  commitProcessName();
  startCurrentProcess();
  showNamePanel();
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[,"\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportCsv() {
  if (processes.length === 0) return;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rows = [
    [
      "Process #",
      "Started At Local",
      "Started At ISO",
      "Name",
      "Started Elapsed",
      "Screenshot Taken",
      "Screenshot File",
      "Screenshot Captured At Local",
      "Screenshot Captured At ISO"
    ],
    ...processes.map((process) => [
      process.index,
      process.startedAtLocal,
      process.startedAtIso,
      process.name,
      formatElapsed(process.startedElapsedMs),
      process.screenshotDataUrl ? "Yes" : "No",
      process.screenshotFileName,
      process.screenshotTakenAtLocal,
      process.screenshotTakenAtIso
    ])
  ];

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  triggerDownload(csv, `standard-work-processes-${stamp}.csv`, "text/csv;charset=utf-8;");
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

startBtn.addEventListener("click", () => {
  startSession();
  startRecordingIfNeeded();
});

pauseBtn.addEventListener("click", () => {
  if (running) {
    pauseSession();
  } else if (sessionStarted) {
    startSession();
  }
});

stopBtn.addEventListener("click", stopSession);
cameraBtn.addEventListener("click", enableCamera);
exportBtn.addEventListener("click", exportCsv);
processImageBtn.addEventListener("click", captureProcessImage);
nameProcessBtn.addEventListener("click", showNamePanel);
nextProcessBtn.addEventListener("click", nextProcess);
saveProcessNameBtn.addEventListener("click", commitProcessName);
cancelProcessNameBtn.addEventListener("click", hideNamePanel);
processNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitProcessName();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    hideNamePanel();
  }
});

window.addEventListener("beforeunload", () => {
  finalizeRecordingDownload();
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
});

setProcessLabel();
setSessionState();
renderTimer();
renderProcesses();
