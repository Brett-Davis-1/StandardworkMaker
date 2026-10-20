/* Timing depends on timestamps, never on the frequency of display updates. */
class CycleTimer {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.reset();
  }
  reset() {
    this.state = "idle";
    this.accumulatedMs = 0;
    this.startedAt = null;
    this.laps = [];
  }
  elapsed(at = this.now()) {
    return this.accumulatedMs + (this.state === "running" ? Math.max(0, at - this.startedAt) : 0);
  }
  start() {
    if (this.state !== "idle") return false;
    this.startedAt = this.now();
    this.state = "running";
    return true;
  }
  nextUnit() {
    if (this.state !== "running") return null;
    // A single timestamp closes the old unit and opens the new one without a gap.
    const at = this.now();
    const lap = { unit: this.laps.length + 1, milliseconds: this.elapsed(at) };
    this.laps.push(lap);
    this.accumulatedMs = 0;
    this.startedAt = at;
    return lap;
  }
  pause() {
    if (this.state !== "running") return false;
    this.accumulatedMs = this.elapsed();
    this.startedAt = null;
    this.state = "paused";
    return true;
  }
  resume() {
    if (this.state !== "paused") return false;
    this.startedAt = this.now();
    this.state = "running";
    return true;
  }
  get averageSeconds() {
    return this.laps.length ? this.laps.reduce((sum, lap) => sum + lap.milliseconds, 0) / this.laps.length / 1000 : null;
  }
  csv() {
    return ["unit_number,cycle_time_seconds", ...this.laps.map(lap => `${lap.unit},${(lap.milliseconds / 1000).toFixed(3)}`)].join("\r\n") + "\r\n";
  }
  static format(milliseconds) {
    const centiseconds = Math.floor(Math.max(0, milliseconds) / 10);
    const minutes = Math.floor(centiseconds / 6000);
    const seconds = Math.floor(centiseconds / 100) % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
  }
}
if (typeof module !== "undefined") module.exports = CycleTimer;
