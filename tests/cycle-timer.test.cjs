const test = require('node:test');
const assert = require('node:assert/strict');
const CycleTimer = require('../cyclestudy/timer.js');

function clock() {
  let at = 1000;
  return {timer: new CycleTimer(() => at), advance(ms) { at += ms; }};
}

test('Next Unit closes one lap and starts the next at the same timestamp', () => {
  const {timer, advance} = clock();
  timer.start(); advance(12567);
  assert.deepEqual(timer.nextUnit(), {unit: 1, milliseconds: 12567});
  assert.equal(timer.elapsed(), 0);
  advance(2433); timer.nextUnit();
  assert.deepEqual(timer.laps.map(l => l.milliseconds), [12567, 2433]);
  assert.equal(timer.averageSeconds, 7.5);
});

test('all paused time is excluded, including repeated pauses before a lap', () => {
  const {timer, advance} = clock();
  timer.start(); advance(3500); timer.pause();
  advance(40000);
  assert.equal(timer.elapsed(), 3500);
  assert.equal(timer.nextUnit(), null);
  timer.resume(); advance(1500); timer.pause(); advance(90000);
  timer.resume(); advance(2500);
  assert.equal(timer.nextUnit().milliseconds, 7500);
  assert.equal(timer.laps.length, 1);
  assert.deepEqual(Object.keys(timer.laps[0]), ['unit', 'milliseconds']);
});

test('invalid transitions do not start, lose, or duplicate time', () => {
  const {timer, advance} = clock();
  assert.equal(timer.pause(), false);
  assert.equal(timer.resume(), false);
  assert.equal(timer.nextUnit(), null);
  assert.equal(timer.start(), true);
  advance(200);
  assert.equal(timer.start(), false);
  assert.equal(timer.resume(), false);
  assert.equal(timer.elapsed(), 200);
  timer.pause(); advance(100);
  assert.equal(timer.pause(), false);
  assert.equal(timer.elapsed(), 200);
});

test('reset clears recorded and current cycles in every state', () => {
  for (const paused of [false, true]) {
    const {timer, advance} = clock();
    timer.start(); advance(3000); timer.nextUnit(); advance(1000);
    if(paused) timer.pause();
    timer.reset(); advance(50000);
    assert.equal(timer.state, 'idle');
    assert.equal(timer.elapsed(), 0);
    assert.equal(timer.averageSeconds, null);
    assert.deepEqual(timer.laps, []);
    timer.start(); advance(2400);
    assert.deepEqual(timer.nextUnit(), {unit: 1, milliseconds: 2400});
  }
});

test('CSV exports only completed units, in order, with seconds and CRLF', () => {
  const {timer, advance} = clock();
  timer.start(); advance(1234.567); timer.nextUnit();
  advance(2000); timer.nextUnit(); advance(9999);
  assert.equal(timer.csv(), 'unit_number,cycle_time_seconds\r\n1,1.235\r\n2,2.000\r\n');
});

test('elapsed time is accurate without display ticks, including long cycles', () => {
  const {timer, advance} = clock();
  timer.start(); advance(3600123);
  assert.equal(timer.elapsed(), 3600123);
  assert.equal(CycleTimer.format(timer.elapsed()), '60:00.12');
  assert.equal(CycleTimer.format(59999), '00:59.99');
  assert.equal(CycleTimer.format(60000), '01:00.00');
});

test('many units preserve count, total duration, and average', () => {
  const {timer, advance} = clock();
  timer.start();
  for(let i=0;i<1000;i++) { advance(1234); timer.nextUnit(); }
  assert.equal(timer.laps.length, 1000);
  assert.equal(timer.averageSeconds, 1.234);
  assert.equal(timer.laps[999].unit, 1000);
  assert.equal(timer.elapsed(), 0);
});
