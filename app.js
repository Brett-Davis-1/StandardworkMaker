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

let running = false;
let startTime = 0;
let elapsedBefore = 0;
let rafId = null;
let events = [];
let stream = null;

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

function setSessionState(active) {
  startBtn.disabled = active;
  pauseBtn.disabled = !active;
  stopBtn.disabled = !active;
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
  if (elapsedBefore === 0 && events.length === 0) {
    appendEvent("Session Start");
  } else {
    appendEvent("Resume");
  }
  running = true;
  startTime = nowMs();
  setSessionState(true);
  cancelAnimationFrame(rafId);
  renderTimer();
}

function pauseSession(logPause = true) {
  if (!running) return;
  elapsedBefore = currentElapsed();
  running = false;
  cancelAnimationFrame(rafId);
  renderTimer();
  if (logPause) appendEvent("Paused");
  setSessionState(false);
}

function stopSession() {
  if (!running && elapsedBefore === 0 && events.length === 0) return;
  if (running) {
    elapsedBefore = currentElapsed();
    running = false;
    cancelAnimationFrame(rafId);
  }
  appendEvent("Session Stop");
  setSessionState(false);
  renderTimer();
}

function resetSession() {
  running = false;
  startTime = 0;
  elapsedBefore = 0;
  cancelAnimationFrame(rafId);
  renderTimer();
  setSessionState(false);
  events = [];
  logBody.innerHTML = "";
}

async function enableCamera() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    liveVideo.srcObject = stream;
    videoFallback.classList.add("hidden");
    cameraBtn.textContent = "Camera Active";
    cameraBtn.disabled = true;
  } catch {
    videoFallback.classList.remove("hidden");
    cameraBtn.textContent = "Camera Blocked";
  }
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportCsv() {
  if (events.length === 0) return;
  const rows = [
    ["Index", "Tag", "Elapsed", "Timestamp ISO"],
    ...events.map((e) => [e.index, e.tag, e.elapsedLabel, e.timestampIso])
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `standard-work-events-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

startBtn.addEventListener("click", startSession);
pauseBtn.addEventListener("click", () => pauseSession(true));
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
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
});

setSessionState(false);
renderTimer();
