import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleBuddySound } from '../app/sounds.js';

class FakeParam {
  constructor(context, value) {
    this.context = context;
    this.value = value;
    this.last = -Infinity;
  }

  at(time) {
    assert.ok(Number.isFinite(time) && time >= 0, `bad time ${time}`);
    assert.ok(time >= this.last, `events out of order: ${time} after ${this.last}`);
    this.last = time;
  }

  setValueAtTime(value, time) {
    assert.ok(Number.isFinite(value), `bad value ${value}`);
    this.at(time);
  }

  exponentialRampToValueAtTime(value, time) {
    assert.ok(value > 0, `exponential ramp to ${value}`);
    this.at(time);
  }
}

class FakeNode {
  constructor(context) {
    this.context = context;
  }

  connect(target) {
    this.context.links += 1;
    return target;
  }
}

class FakeSource extends FakeNode {
  start(time) {
    assert.ok(time >= 0);
    this.context.started += 1;
  }

  stop(time) {
    assert.ok(time >= 0);
  }
}

class FakeContext {
  constructor() {
    this.currentTime = 1;
    this.sampleRate = 8000;
    this.destination = {};
    this.started = 0;
    this.links = 0;
  }

  createOscillator() {
    const node = new FakeSource(this);
    node.frequency = new FakeParam(this, 440);
    return node;
  }

  createBufferSource() {
    return new FakeSource(this);
  }

  createGain() {
    const node = new FakeNode(this);
    node.gain = new FakeParam(this, 1);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeNode(this);
    node.frequency = new FakeParam(this, 350);
    node.Q = new FakeParam(this, 1);
    return node;
  }

  createDynamicsCompressor() {
    const node = new FakeNode(this);
    node.threshold = new FakeParam(this, -24);
    return node;
  }

  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

const KINDS = ['robot', 'cat', 'puppy', 'bunny', 'panda', 'pig'];
const CUES = ['add', 'edit', 'done', 'late', 'clear', 'habit', 'allhabits', 'undo', 'bye', 'poke', 'pokesad', 'dizzy', 'boing', 'wheee', 'meet'];

test('every companion has a sound for every reaction, and each one schedules cleanly', () => {
  for (const kind of KINDS) {
    for (const cue of CUES) {
      const context = new FakeContext();
      assert.equal(scheduleBuddySound(context, kind, cue), true, `${kind} ${cue}`);
      assert.ok(context.started > 0, `${kind} ${cue} played nothing`);
    }
  }
});

test('a late finish sighs first, then plays the happy sound after it', () => {
  const context = new FakeContext();
  const starts = [];
  const original = context.createOscillator.bind(context);
  context.createOscillator = () => {
    const node = original();
    const start = node.start.bind(node);
    node.start = (time) => {
      starts.push(time);
      start(time);
    };
    return node;
  };
  scheduleBuddySound(context, 'cat', 'late');
  assert.ok(starts.some((time) => time >= context.currentTime + 0.45));
});
