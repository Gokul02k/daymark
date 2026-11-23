// The animals speak only with real recordings from public/sounds (credits in CREDITS.md there).
// Each companion's clips start loading as soon as sound is on, and a clip asked for before it
// has loaded plays as soon as it arrives, if that is still within a moment. The robot is the one
// companion meant to sound electronic, so its beeps are made here with Web Audio.

const CUES = {
  add: 'wow',
  list: 'wow',
  newhabit: 'wow',
  newlook: 'cheer',
  meet: 'cheer',
  clear: 'cheer',
  allhabits: 'cheer',
  edit: 'think',
  done: 'happy',
  habit: 'happy',
  step: 'happy',
  log: 'happy',
  remind: 'happy',
  restore: 'happy',
  late: 'phew',
  undo: 'huh',
  bye: 'sad',
  pokesad: 'sad',
  poke: 'giggle',
  dizzy: 'dizzy',
  boing: 'boing',
  wheee: 'wheee',
  pet: 'pet',
  tickle: 'laugh',
  achoo: 'achoo',
  sneeze: 'sneeze',
  ears: 'huh',
  yawn: 'yawn',
  snore: 'snore',
  wake: 'wow',
  love: 'cheer',
};

/** Every mood a companion needs a sound for. */
export const MOODS = [
  'happy', 'cheer', 'wow', 'think', 'huh', 'sad', 'giggle', 'pet', 'laugh',
  'phew', 'boing', 'wheee', 'dizzy', 'achoo', 'sneeze', 'yawn', 'snore',
];

// How long a sound may wait for its recording to arrive before it is skipped.
const LATE_LIMIT_MS = 700;

let context = null;
let output = null;
let noise = null;

function audio() {
  if (typeof window === 'undefined') return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  try {
    if (!context) context = new Context();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  } catch {
    return null;
  }
}

function out(ac) {
  if (output?.context === ac) return output.node;
  const squash = ac.createDynamicsCompressor();
  squash.threshold.value = -14;
  const level = ac.createGain();
  level.gain.value = 0.8;
  squash.connect(level);
  level.connect(ac.destination);
  output = { context: ac, node: squash };
  return squash;
}

// ---- The robot's synthesizer ----

function noiseBuffer(ac) {
  if (noise?.context === ac) return noise.buffer;
  const length = Math.floor(ac.sampleRate * 0.6);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  noise = { context: ac, buffer };
  return buffer;
}

/** `points` is a number, or [[seconds from start, value], ...]. */
function glide(param, start, points) {
  if (typeof points === 'number') {
    param.setValueAtTime(points, start);
    return;
  }
  param.setValueAtTime(points[0][1], start + points[0][0]);
  for (const [at, value] of points.slice(1)) param.exponentialRampToValueAtTime(Math.max(value, 1), start + at);
}

function envelope(param, start, length, peak, attack, release) {
  const hold = Math.max(attack, length - release);
  param.setValueAtTime(0.0001, start);
  param.exponentialRampToValueAtTime(peak, start + attack);
  param.setValueAtTime(peak, start + hold);
  param.exponentialRampToValueAtTime(0.0001, start + length);
}

function wobble(ac, param, start, end, { rate, depth }) {
  const lfo = ac.createOscillator();
  const amount = ac.createGain();
  lfo.frequency.value = rate;
  amount.gain.value = depth;
  lfo.connect(amount);
  amount.connect(param);
  lfo.start(start);
  lfo.stop(end + 0.05);
}

function band(ac, start, type, freq, q) {
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  glide(filter.frequency, start, freq);
  return filter;
}

function tone(ac, at, opts) {
  const { wave = 'sine', pitch, length, peak = 0.2, attack = 0.01, release = 0.05, vibrato, lowpass } = opts;
  const start = ac.currentTime + 0.02 + at;
  const end = start + length;
  const osc = ac.createOscillator();
  osc.type = wave;
  glide(osc.frequency, start, pitch);
  if (vibrato) wobble(ac, osc.frequency, start, end, vibrato);
  const amp = ac.createGain();
  envelope(amp.gain, start, length, peak, attack, release);
  if (lowpass) {
    const filter = band(ac, start, 'lowpass', lowpass, 0.8);
    osc.connect(filter);
    filter.connect(amp);
  } else {
    osc.connect(amp);
  }
  amp.connect(out(ac));
  osc.start(start);
  osc.stop(end + 0.05);
}

function hiss(ac, at, opts) {
  const { type = 'bandpass', freq, q = 1, length, peak = 0.3, attack = 0.005, release = 0.05, tremolo } = opts;
  const start = ac.currentTime + 0.02 + at;
  const end = start + length;
  const source = ac.createBufferSource();
  source.buffer = noiseBuffer(ac);
  const filter = band(ac, start, type, freq, q);
  const amp = ac.createGain();
  envelope(amp.gain, start, length, peak, attack, release);
  source.connect(filter);
  filter.connect(amp);
  if (tremolo) {
    const level = ac.createGain();
    level.gain.value = 1 - tremolo.depth / 2;
    wobble(ac, level.gain, start, end, { rate: tremolo.rate, depth: tremolo.depth / 2 });
    amp.connect(level);
    level.connect(out(ac));
  } else {
    amp.connect(out(ac));
  }
  source.start(start);
  source.stop(end + 0.05);
}

function beep(ac, at, pitch, length = 0.08, peak = 0.11) {
  tone(ac, at, { wave: 'square', pitch, length, peak, lowpass: 2600, release: 0.03 });
}

function beeps(ac, at, pitches, gap, length, peak) {
  pitches.forEach((pitch, index) => beep(ac, at + index * gap, pitch, length, peak));
}

const ROBOT = {
  happy: (ac, at = 0) => beeps(ac, at, [660, 880, 990], 0.1),
  cheer: (ac) => {
    beeps(ac, 0, [660, 830, 990, 1320], 0.08, 0.07);
    beeps(ac, 0.36, [1320, 1480, 1320, 1480], 0.045, 0.04, 0.08);
  },
  wow: (ac) => beep(ac, 0, [[0, 400], [0.25, 900]], 0.25),
  think: (ac) => beeps(ac, 0, [700, 1100, 600, 900, 1250, 800], 0.055, 0.035, 0.08),
  huh: (ac) => beep(ac, 0, [[0, 500], [0.18, 760]], 0.18),
  sad: (ac) => {
    tone(ac, 0, { wave: 'square', pitch: [[0, 520], [0.25, 420]], length: 0.25, peak: 0.1, lowpass: 1800 });
    tone(ac, 0.28, { wave: 'square', pitch: [[0, 440], [0.4, 300]], length: 0.4, peak: 0.1, lowpass: 1600, vibrato: { rate: 7, depth: 12 } });
  },
  giggle: (ac) => beeps(ac, 0, [990, 1180, 880], 0.065, 0.05),
  pet: (ac) => {
    tone(ac, 0, { pitch: [[0, 330], [1, 392]], length: 1, peak: 0.08, attack: 0.2, release: 0.3, vibrato: { rate: 5, depth: 6 } });
    tone(ac, 0, { pitch: [[0, 495], [1, 588]], length: 1, peak: 0.05, attack: 0.25, release: 0.3 });
  },
  laugh: (ac) => beeps(ac, 0, [880, 990, 880, 1110, 990, 1320], 0.07, 0.045, 0.09),
  phew: (ac) => {
    hiss(ac, 0, { type: 'lowpass', freq: [[0, 1200], [0.45, 450]], q: 0.7, length: 0.45, peak: 0.22, attack: 0.1, release: 0.2 });
    ROBOT.happy(ac, 0.45);
  },
  boing: (ac) => tone(ac, 0, { wave: 'triangle', pitch: [[0, 240], [0.12, 560], [0.32, 300]], length: 0.32, peak: 0.2, vibrato: { rate: 18, depth: 25 } }),
  wheee: (ac) => tone(ac, 0, { pitch: [[0, 600], [0.35, 1400]], length: 0.35, peak: 0.12, attack: 0.03 }),
  dizzy: (ac) => tone(ac, 0, { wave: 'triangle', pitch: [[0, 820], [0.6, 440]], length: 0.6, peak: 0.16, vibrato: { rate: 9, depth: 90 } }),
  achoo: (ac) => beeps(ac, 0, [[[0, 500], [0.2, 800]], [[0, 600], [0.25, 1000]]], 0.3, 0.22, 0.08),
  sneeze: (ac) => {
    hiss(ac, 0, { type: 'highpass', freq: 2200, q: 0.7, length: 0.2, peak: 0.45, attack: 0.004, release: 0.15 });
    beep(ac, 0.05, [[0, 900], [0.15, 300]], 0.15);
  },
  yawn: (ac) => tone(ac, 0, { wave: 'square', pitch: [[0, 300], [0.4, 420], [1, 180]], length: 1, peak: 0.07, attack: 0.1, release: 0.3, lowpass: 1200 }),
  snore: (ac) => {
    hiss(ac, 0, { type: 'lowpass', freq: 320, q: 1, length: 0.9, peak: 0.22, attack: 0.25, release: 0.3, tremolo: { rate: 32, depth: 0.8 } });
    tone(ac, 1.05, { pitch: [[0, 900], [0.45, 1250]], length: 0.45, peak: 0.05, attack: 0.15, release: 0.2 });
  },
};

// ---- The animals' recordings ----

// Files under public/sounds without ".mp3". Each mood lists a few takes and one is picked at
// random. A take is one file, or several clips as [file, seconds later, speed, loudness].
const SAMPLES = {
  cat: {
    happy: ['cat/meow', 'cat/meow-short'],
    cheer: [[['cat/meow-short'], ['cat/meow', 0.3]]],
    wow: ['cat/meow-ask'],
    think: [[['cat/purr', 0, 1, 0.8]]],
    huh: ['cat/meow-ask', [['cat/meow-ask', 0, 1.1]]],
    sad: ['cat/meow-sad'],
    giggle: [[['cat/meow-short', 0, 1.2], ['cat/meow-short', 0.2, 1.1]]],
    pet: ['cat/purr'],
    laugh: [[['cat/meow-short', 0, 1.15], ['cat/meow-short', 0.16, 1.25], ['cat/meow-short', 0.32, 1.35]]],
    phew: [[['cat/purr', 0, 1, 0.6], ['cat/meow', 0.5]]],
    boing: [[['cat/meow-short', 0, 1.3]]],
    wheee: [[['cat/meow-ask', 0, 1.25]]],
    dizzy: [[['cat/meow-sad', 0, 0.75]]],
    achoo: [[['cat/meow-short', 0, 0.85, 0.5]]],
    sneeze: [[['cat/meow-short', 0, 1.5]]],
    yawn: [[['cat/meow-sad', 0, 0.8]]],
    snore: [[['cat/purr', 0, 0.8, 0.7]]],
  },
  puppy: {
    happy: ['puppy/bark', 'puppy/yip'],
    cheer: ['puppy/bark-double', [['puppy/bark'], ['puppy/yip', 0.25]]],
    wow: ['puppy/yip'],
    think: [[['puppy/whine', 0, 1.2, 0.6]]],
    huh: [[['puppy/whine', 0, 1.15]], 'puppy/yip'],
    sad: ['puppy/whine'],
    giggle: [[['puppy/yip'], ['puppy/yip', 0.14, 1.1]]],
    pet: [[['puppy/whine', 0, 1.3, 0.5]]],
    laugh: [[['puppy/yip', 0, 1.1], ['puppy/yip', 0.13, 1.2], ['puppy/yip', 0.26, 1.3]], 'puppy/bark-double'],
    phew: [[['puppy/whine', 0, 1, 0.6], ['puppy/bark', 0.5]]],
    boing: [[['puppy/yip', 0, 0.9]]],
    wheee: [[['puppy/yip', 0, 1.2], ['puppy/yip', 0.12, 1.35]]],
    dizzy: [[['puppy/whine', 0, 0.8]]],
    achoo: [[['puppy/yip', 0, 0.8, 0.5]]],
    sneeze: [[['puppy/bark', 0, 1.4]]],
    yawn: [[['puppy/whine', 0, 0.75]]],
    snore: [[['puppy/whine', 0, 0.6, 0.4]]],
  },
  pig: {
    happy: ['pig/oink'],
    cheer: ['pig/oink-double', [['pig/oink'], ['pig/squeal', 0.3]]],
    wow: [[['pig/oink', 0, 1.15]]],
    think: ['pig/grunt'],
    huh: [[['pig/oink', 0, 1.2]]],
    sad: [[['pig/grunt', 0, 0.85]]],
    giggle: [[['pig/grunt', 0, 1.2], ['pig/oink', 0.2, 1.15]], 'pig/oink-double'],
    pet: [[['pig/grunt'], ['pig/grunt', 0.45, 0.95]]],
    laugh: [[['pig/oink', 0, 1.2], ['pig/oink', 0.18, 1.3], ['pig/squeal', 0.36]]],
    phew: [[['pig/grunt', 0, 0.9], ['pig/oink', 0.5]]],
    boing: [[['pig/oink', 0, 1.35]]],
    wheee: ['pig/squeal'],
    dizzy: [[['pig/grunt', 0, 0.7]]],
    achoo: [[['pig/grunt', 0, 1.3, 0.5]]],
    sneeze: [[['pig/oink', 0, 1.5]]],
    yawn: [[['pig/grunt', 0, 0.75]]],
    snore: [[['pig/grunt', 0, 0.8, 0.7], ['pig/grunt', 0.7, 0.75, 0.6]]],
  },
  panda: {
    happy: ['panda/bleat', 'panda/chirp'],
    cheer: [[['panda/chirp'], ['panda/bleat', 0.25]]],
    wow: ['panda/chirp'],
    think: ['panda/munch'],
    huh: [[['panda/chirp', 0, 1.1]]],
    sad: [[['panda/bleat', 0, 0.85]]],
    giggle: [[['panda/chirp', 0, 1.1], ['panda/chirp', 0.18, 1.2]]],
    pet: ['panda/munch'],
    laugh: [[['panda/chirp', 0, 1.15], ['panda/chirp', 0.15, 1.25], ['panda/chirp', 0.3, 1.35]]],
    phew: [[['panda/bleat', 0, 0.9, 0.6], ['panda/chirp', 0.5]]],
    boing: [[['panda/chirp', 0, 1.3]]],
    wheee: [[['panda/bleat', 0, 1.2]]],
    dizzy: [[['panda/bleat', 0, 0.75]]],
    achoo: [[['panda/chirp', 0, 0.8, 0.5]]],
    sneeze: [[['panda/chirp', 0, 1.5]]],
    yawn: [[['panda/bleat', 0, 0.7]]],
    snore: [[['panda/munch', 0, 0.6, 0.5]]],
  },
  bunny: {
    happy: ['bunny/squeak'],
    cheer: [[['bunny/squeak'], ['bunny/squeak', 0.2, 1.15]]],
    wow: ['bunny/squeak'],
    think: ['bunny/munch'],
    huh: [[['bunny/squeak', 0, 1.1]]],
    sad: [[['bunny/squeak', 0, 0.8]]],
    giggle: [[['bunny/squeak', 0, 1.1], ['bunny/squeak', 0.12, 1.2]]],
    pet: ['bunny/munch'],
    laugh: [[['bunny/squeak', 0, 1.1], ['bunny/squeak', 0.1, 1.2], ['bunny/squeak', 0.2, 1.3]]],
    phew: [[['bunny/munch', 0, 1, 0.6], ['bunny/squeak', 0.5]]],
    boing: [[['bunny/squeak', 0, 1.35]]],
    wheee: [[['bunny/squeak', 0, 1.25], ['bunny/squeak', 0.12, 1.4]]],
    dizzy: [[['bunny/squeak', 0, 0.7]]],
    achoo: [[['bunny/squeak', 0, 0.85, 0.5]]],
    sneeze: [[['bunny/squeak', 0, 1.5]]],
    yawn: [[['bunny/squeak', 0, 0.65]]],
    snore: [[['bunny/munch', 0, 0.6, 0.5]]],
  },
};

/** The clips in a take, as a list of { file, at, rate, gain }. */
function takeClips(take) {
  if (typeof take === 'string') return [{ file: take, at: 0, rate: 1, gain: 1 }];
  return take.map(([file, at = 0, rate = 1, gain = 1]) => ({ file, at, rate, gain }));
}

/** Which companions speak with recordings. */
export function recordedKinds() {
  return Object.keys(SAMPLES);
}

/** The takes a recorded companion has for a mood. */
export function takesFor(kind, mood) {
  return SAMPLES[kind]?.[mood] || [];
}

/** Every recording the companions use, for preloading and for the tests. */
export function sampleFiles(kind) {
  const kinds = kind ? [kind] : Object.keys(SAMPLES);
  const files = new Set();
  for (const name of kinds) {
    for (const takes of Object.values(SAMPLES[name] || {})) {
      for (const take of takes) for (const clip of takeClips(take)) files.add(clip.file);
    }
  }
  return [...files].sort();
}

// file -> AudioBuffer, or a promise while loading, or null when it couldn't be had.
const clips = new Map();

function decoder() {
  const Offline = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  return Offline ? new Offline(1, 1, 44100) : audio();
}

function loadClip(file) {
  if (clips.has(file)) return clips.get(file);
  const loading = fetch(`/sounds/${file}.mp3`)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
    .then(
      (data) =>
        new Promise((resolve, reject) => {
          const ctx = decoder();
          if (!ctx) return reject(new Error('no audio'));
          const done = ctx.decodeAudioData(data, resolve, reject);
          if (done?.then) done.then(resolve, reject);
        }),
    )
    .then((buffer) => {
      clips.set(file, buffer);
      return buffer;
    })
    .catch(() => {
      clips.set(file, null);
      return null;
    });
  clips.set(file, loading);
  return loading;
}

/** Starts fetching a companion's recordings, so its first sound isn't late. */
export function preloadBuddySounds(kind) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  for (const file of sampleFiles(kind)) loadClip(file);
}

function ready(file) {
  const value = clips.get(file);
  return value && typeof value.then !== 'function' ? value : null;
}

/** Plays one take of recordings. False if any of its clips isn't loaded. */
export function scheduleSamples(ac, take, offset = 0, lookup = ready) {
  const parts = takeClips(take);
  const buffers = parts.map((part) => lookup(part.file));
  if (buffers.some((buffer) => !buffer)) return false;
  const jitter = 0.95 + Math.random() * 0.1;
  parts.forEach((part, index) => {
    const source = ac.createBufferSource();
    source.buffer = buffers[index];
    source.playbackRate.value = part.rate * jitter;
    const level = ac.createGain();
    level.gain.value = 0.9 * part.gain;
    source.connect(level);
    level.connect(out(ac));
    source.start(ac.currentTime + 0.02 + offset + part.at);
  });
  return true;
}

/**
 * Schedules the robot's synthesized sound on `ac`. Exported so tests can run it against a
 * fake context. Recorded companions go through playBuddySound instead.
 */
export function scheduleBuddySound(ac, kind, cue) {
  const mood = CUES[cue] || cue;
  if (kind !== 'robot' && SAMPLES[kind]) return false;
  if (!ROBOT[mood]) return false;
  ROBOT[mood](ac);
  return true;
}

/** Plays the companion's voice for a reaction. Browsers only allow sound after a tap. */
export function playBuddySound(kind, cue) {
  const ac = audio();
  if (!ac) return;
  const mood = CUES[cue] || cue;
  try {
    if (!SAMPLES[kind]) {
      scheduleBuddySound(ac, 'robot', mood);
      return;
    }
    const takes = takesFor(kind, mood);
    if (takes.length === 0) return;
    const take = takes[Math.floor(Math.random() * takes.length)];
    if (scheduleSamples(ac, take)) return;
    const asked = Date.now();
    Promise.all(takeClips(take).map((clip) => loadClip(clip.file))).then(() => {
      if (Date.now() - asked <= LATE_LIMIT_MS) scheduleSamples(ac, take);
    });
  } catch {}
}
