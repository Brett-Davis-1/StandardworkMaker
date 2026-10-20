const study = new CycleTimer();
const element = id => document.getElementById(id);
const nextBtn = element("nextBtn");
const pauseBtn = element("pauseBtn");
const exportBtn = element("exportBtn");
const resetBtn = element("resetBtn");
let exportedCount = 0;

function updateTimer() {
  element("timer").textContent = CycleTimer.format(study.elapsed());
}

function renderControls(message) {
  const idle = study.state === "idle";
  const paused = study.state === "paused";
  nextBtn.textContent = idle ? "Start study →" : "Next Unit →";
  nextBtn.disabled = paused;
  pauseBtn.disabled = idle;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  exportBtn.disabled = study.laps.length === 0;
  resetBtn.disabled = idle;
  element("unitLabel").textContent = `UNIT ${study.laps.length + 1}`;
  element("stateBadge").dataset.state = study.state;
  element("stateText").textContent = idle ? "Ready" : paused ? "Paused" : "Running";
  element("completedCount").textContent = study.laps.length;
  const average = study.averageSeconds;
  element("average").replaceChildren(document.createTextNode(average === null ? "— " : `${average.toFixed(3)} `));
  const seconds = document.createElement("small");
  seconds.textContent = "sec";
  element("average").append(seconds);
  element("emptyState").hidden = study.laps.length > 0;
  element("lapTableWrap").hidden = study.laps.length === 0;
  if (message) element("status").textContent = message;
  updateTimer();
}

nextBtn.addEventListener("click", event => {
  // A double tap should not accidentally record a near-zero second unit.
  if (event.detail > 1) return;
  if (study.state === "idle") {
    study.start();
    renderControls("Timing unit 1. Tap Next Unit when it is complete.");
    return;
  }
  const lap = study.nextUnit();
  if (!lap) return;
  const row = document.createElement("tr");
  const number = document.createElement("th");
  number.scope = "row";
  number.textContent = String(lap.unit).padStart(2, "0");
  const time = document.createElement("td");
  time.textContent = (lap.milliseconds / 1000).toFixed(3);
  row.append(number, time);
  element("lapList").prepend(row);
  element("lapTableWrap").scrollTop = 0;
  renderControls(`Unit ${lap.unit} recorded: ${(lap.milliseconds / 1000).toFixed(3)} seconds. Timing unit ${lap.unit + 1}.`);
});

pauseBtn.addEventListener("click", () => {
  if (study.state === "running") {
    study.pause();
    renderControls("Paused. Resume to continue timing this unit; paused time will be excluded.");
  } else if (study.state === "paused") {
    study.resume();
    renderControls(`Timing unit ${study.laps.length + 1}. Tap Next Unit when it is complete.`);
  }
});

resetBtn.addEventListener("click", () => {
  if (!window.confirm("Reset this study? All recorded unit times and the current timer will be cleared. Export CSV first if you want to keep them.")) return;
  study.reset();
  exportedCount = 0;
  element("lapList").replaceChildren();
  renderControls("Study reset. Press Start study when work on the first unit begins.");
});

exportBtn.addEventListener("click", () => {
  if (!study.laps.length) return;
  const blob = new Blob(["\uFEFF", study.csv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  // Include a timestamp so sequential studies do not share a download name.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `lineflow-cycle-study-${stamp}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  exportedCount = study.laps.length;
  renderControls(`CSV download requested for ${study.laps.length} completed unit${study.laps.length === 1 ? "" : "s"}. The current unit is not included.`);
});

// Warn about losing an unexported study when the browser supports this prompt.
window.addEventListener("beforeunload", event => {
  if (study.laps.length > exportedCount || study.state === "running" || study.elapsed() >= 1000) {
    event.preventDefault();
    event.returnValue = "";
  }
});
document.addEventListener("visibilitychange", updateTimer);
setInterval(updateTimer, 50);
renderControls();
