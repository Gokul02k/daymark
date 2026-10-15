// Every companion sound is synthesized here with Web Audio, so nothing has to be downloaded.
// Animal voices run a buzzy source through two band-pass "formant" filters, which is what
// makes a sweep sound like a vowel ("mee-ow", "oink", "baa").

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
};

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
  const real = ac.base || ac;
  if (output?.context === real) return output.node;
  const squash = real.createDynamicsCompressor();
  squash.threshold.value = -14;
  const level = real.createGain();
  level.gain.value = 0.8;
  squash.connect(level);
  level.connect(real.destination);
  output = { context: real, node: squash };
  return squash;
}

function noiseBuffer(ac) {
  const real = ac.base || ac;
  if (noise?.context === real) return noise.buffer;
  const length = Math.floor(real.sampleRate * 0.6);
  const buffer = real.createBuffer(1, length, real.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  noise = { context: real, buffer };
  return buffer;
}

/** The same context with its clock pushed `offset` seconds ahead, to start a sound later. */
function later(ac, offset) {
  return {
    base: ac.base || ac,
    get currentTime() {
      return ac.currentTime + offset;
    },
    createOscillator: () => ac.createOscillator(),
    createGain: () => ac.createGain(),
    createBiquadFilter: () => ac.createBiquadFilter(),
    createBufferSource: () => ac.createBufferSource(),
  };
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

function flutter(ac, source, start, end, { rate, depth }) {
  const level = ac.createGain();
  level.gain.value = 1 - depth / 2;
  wobble(ac, level.gain, start, end, { rate, depth: depth / 2 });
  source.connect(level);
  return level;
}

function band(ac, start, type, freq, q) {
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  glide(filter.frequency, start, freq);
  return filter;
}

/** A vowel-like voice: a buzzy source through two formant filters. */
function voice(ac, at, opts) {
  const { wave = 'sawtooth', pitch, f1, f2, q1 = 6, q2 = 8, mix = 0.6, body = 0.12, length } = opts;
  const { attack = 0.02, release = 0.08, peak = 0.6, vibrato, tremolo } = opts;
  const start = ac.currentTime + 0.02 + at;
  const end = start + length;
  const osc = ac.createOscillator();
  osc.type = wave;
  glide(osc.frequency, start, pitch);
  if (vibrato) wobble(ac, osc.frequency, start, end, vibrato);
  const amp = ac.createGain();
  envelope(amp.gain, start, length, peak, attack, release);
  const low = band(ac, start, 'bandpass', f1, q1);
  const high = band(ac, start, 'bandpass', f2, q2);
  const highLevel = ac.createGain();
  highLevel.gain.value = mix;
  const dry = band(ac, start, 'lowpass', 2600, 0.7);
  const dryLevel = ac.createGain();
  dryLevel.gain.value = body;
  osc.connect(low);
  osc.connect(high);
  osc.connect(dry);
  high.connect(highLevel);
  dry.connect(dryLevel);
  low.connect(amp);
  highLevel.connect(amp);
  dryLevel.connect(amp);
  const last = tremolo ? flutter(ac, amp, start, end, tremolo) : amp;
  last.connect(out(ac));
  osc.start(start);
  osc.stop(end + 0.05);
}

/** A plain pitched tone: beeps, squeaks, whines, and whistles. */
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

/** Filtered noise: thumps, snorts, crunches, purrs, and sighs. */
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
  const last = tremolo ? flutter(ac, amp, start, end, tremolo) : amp;
  last.connect(out(ac));
  source.start(start);
  source.stop(end + 0.05);
}

function beep(ac, at, pitch, length = 0.08, peak = 0.11) {
  tone(ac, at, { wave: 'square', pitch, length, peak, lowpass: 2600, release: 0.03 });
}

function meow(ac, at, { high = 820, length = 0.38, sad = false, ask = false } = {}) {
  let pitch = [[0, high * 0.82], [length * 0.3, high], [length, high * 0.7]];
  if (sad) pitch = [[0, high], [length * 0.35, high * 0.95], [length, high * 0.58]];
  if (ask) pitch = [[0, high * 0.85], [length, high * 1.3]];
  voice(ac, at, {
    pitch,
    f1: [[0, 320], [length * 0.35, 820], [length, 560]],
    f2: [[0, 2300], [length * 0.35, 1350], [length, 950]],
    length,
    attack: 0.04,
    release: 0.12,
    peak: 0.55,
    vibrato: { rate: 6, depth: sad ? 16 : 9 },
  });
}

function trill(ac, at, length = 0.22) {
  voice(ac, at, {
    pitch: [[0, 520], [length, 760]],
    f1: [[0, 450], [length, 650]],
    f2: [[0, 1600], [length, 1900]],
    length,
    peak: 0.5,
    tremolo: { rate: 26, depth: 0.8 },
  });
}

function bark(ac, at, { pitch = 460, length = 0.16, peak = 0.65 } = {}) {
  voice(ac, at, {
    pitch: [[0, pitch], [length * 0.3, pitch * 1.25], [length, pitch * 0.7]],
    f1: [[0, 700], [length, 380]],
    f2: [[0, 1250], [length, 850]],
    length,
    attack: 0.004,
    release: 0.07,
    peak,
  });
  hiss(ac, at, { freq: 1400, q: 0.8, length: 0.045, peak: 0.22 });
}

function thump(ac, at, peak = 0.5) {
  hiss(ac, at, { type: 'lowpass', freq: 220, q: 0.7, length: 0.12, peak, attack: 0.003, release: 0.1 });
  tone(ac, at, { pitch: [[0, 140], [0.1, 60]], length: 0.12, peak: peak * 0.7, attack: 0.003, release: 0.09 });
}

function squeak(ac, at, from, to, length = 0.07) {
  tone(ac, at, { pitch: [[0, from], [length, to]], length, peak: 0.12, attack: 0.006, release: 0.03 });
}

function bleat(ac, at, { pitch = 440, end, length = 0.3, rate = 9 } = {}) {
  voice(ac, at, {
    pitch: [[0, pitch], [length, end ?? pitch * 1.05]],
    f1: 520,
    f2: 1750,
    length,
    attack: 0.03,
    release: 0.1,
    peak: 0.5,
    tremolo: { rate, depth: 0.75 },
  });
}

function crunch(ac, at, freq = 1700, length = 0.05) {
  hiss(ac, at, { freq, q: 1.5, length, peak: 0.3, release: 0.03 });
}

function oink(ac, at, { pitch = 190, length = 0.2, ask = false, sad = false, peak = 0.7 } = {}) {
  let curve = [[0, pitch], [length * 0.35, pitch * 1.45], [length, pitch * 0.9]];
  if (ask) curve = [[0, pitch], [length, pitch * 1.7]];
  if (sad) curve = [[0, pitch * 1.05], [length, pitch * 0.62]];
  voice(ac, at, {
    pitch: curve,
    f1: [[0, 450], [length * 0.35, 700], [length, 500]],
    f2: [[0, 1300], [length, 1100]],
    q1: 5,
    q2: 6,
    body: 0.18,
    length,
    attack: 0.01,
    release: 0.06,
    peak,
    tremolo: { rate: 42, depth: 0.55 },
  });
  hiss(ac, at, { freq: 800, q: 1, length: 0.05, peak: 0.2 });
}

function snort(ac, at) {
  hiss(ac, at, { freq: 700, q: 1.2, length: 0.07, peak: 0.35, release: 0.04, tremolo: { rate: 55, depth: 0.7 } });
}

const VOICES = {
  robot: {
    happy: (ac) => [660, 880, 990].forEach((pitch, index) => beep(ac, index * 0.1, pitch)),
    cheer: (ac) => {
      [660, 830, 990, 1320].forEach((pitch, index) => beep(ac, index * 0.08, pitch, 0.07));
      [1320, 1480, 1320, 1480].forEach((pitch, index) => beep(ac, 0.36 + index * 0.045, pitch, 0.04, 0.08));
    },
    wow: (ac) => beep(ac, 0, [[0, 400], [0.25, 900]], 0.25),
    think: (ac) => [700, 1100, 600, 900, 1250, 800].forEach((pitch, index) => beep(ac, index * 0.055, pitch, 0.035, 0.08)),
    huh: (ac) => beep(ac, 0, [[0, 500], [0.18, 760]], 0.18),
    sad: (ac) => {
      tone(ac, 0, { wave: 'square', pitch: [[0, 520], [0.25, 420]], length: 0.25, peak: 0.1, lowpass: 1800 });
      tone(ac, 0.28, { wave: 'square', pitch: [[0, 440], [0.4, 300]], length: 0.4, peak: 0.1, lowpass: 1600, vibrato: { rate: 7, depth: 12 } });
    },
    giggle: (ac) => [990, 1180, 880].forEach((pitch, index) => beep(ac, index * 0.065, pitch, 0.05)),
  },
  cat: {
    happy: (ac) => meow(ac, 0),
    cheer: (ac) => {
      meow(ac, 0, { high: 900, length: 0.22 });
      meow(ac, 0.25, { high: 1000, length: 0.3 });
    },
    wow: (ac) => trill(ac, 0),
    think: (ac) => hiss(ac, 0, { type: 'lowpass', freq: 380, q: 0.8, length: 0.8, peak: 0.4, attack: 0.08, release: 0.2, tremolo: { rate: 24, depth: 0.9 } }),
    huh: (ac) => meow(ac, 0, { high: 760, length: 0.26, ask: true }),
    sad: (ac) => meow(ac, 0, { high: 640, length: 0.62, sad: true }),
    giggle: (ac) => {
      trill(ac, 0, 0.14);
      meow(ac, 0.16, { high: 950, length: 0.2 });
    },
  },
  puppy: {
    happy: (ac) => bark(ac, 0),
    cheer: (ac) => {
      bark(ac, 0);
      bark(ac, 0.2, { pitch: 520 });
    },
    wow: (ac) =>
      voice(ac, 0, {
        pitch: [[0, 480], [0.3, 720]],
        f1: [[0, 380], [0.3, 450]],
        f2: [[0, 850], [0.3, 1000]],
        length: 0.3,
        attack: 0.03,
        peak: 0.5,
      }),
    think: (ac) => tone(ac, 0, { wave: 'triangle', pitch: [[0, 520], [0.42, 600]], length: 0.42, peak: 0.13, attack: 0.05, vibrato: { rate: 6, depth: 15 } }),
    huh: (ac) => tone(ac, 0, { pitch: [[0, 900], [0.3, 1250]], length: 0.3, peak: 0.14, attack: 0.03, vibrato: { rate: 7, depth: 20 } }),
    sad: (ac) =>
      tone(ac, 0, {
        pitch: [[0, 1150], [0.18, 1350], [0.55, 850]],
        length: 0.55,
        peak: 0.14,
        attack: 0.04,
        release: 0.15,
        vibrato: { rate: 8, depth: 30 },
      }),
    giggle: (ac) => {
      bark(ac, 0, { pitch: 900, length: 0.09, peak: 0.5 });
      bark(ac, 0.12, { pitch: 1000, length: 0.08, peak: 0.5 });
    },
  },
  bunny: {
    happy: (ac) => {
      thump(ac, 0);
      squeak(ac, 0.14, 1500, 2100);
    },
    cheer: (ac) => {
      thump(ac, 0);
      thump(ac, 0.18);
      squeak(ac, 0.36, 1600, 2300, 0.09);
    },
    wow: (ac) => squeak(ac, 0, 1300, 2000, 0.14),
    think: (ac) => [0, 0.07, 0.14, 0.21].forEach((at) => crunch(ac, at, 3200, 0.018)),
    huh: (ac) => squeak(ac, 0, 1400, 1900, 0.16),
    sad: (ac) => {
      squeak(ac, 0, 1500, 1000, 0.32);
      thump(ac, 0.3, 0.3);
    },
    giggle: (ac) => {
      squeak(ac, 0, 1600, 2200, 0.06);
      squeak(ac, 0.09, 1700, 2300, 0.06);
    },
  },
  panda: {
    happy: (ac) => bleat(ac, 0),
    cheer: (ac) => {
      bleat(ac, 0, { length: 0.2 });
      bleat(ac, 0.24, { pitch: 500, length: 0.26 });
    },
    wow: (ac) => bleat(ac, 0, { pitch: 380, end: 520 }),
    think: (ac) => [0, 0.13, 0.26].forEach((at) => crunch(ac, at)),
    huh: (ac) => bleat(ac, 0, { pitch: 400, end: 540, length: 0.25 }),
    sad: (ac) => bleat(ac, 0, { pitch: 400, end: 290, length: 0.55, rate: 6 }),
    giggle: (ac) => {
      bleat(ac, 0, { pitch: 560, length: 0.14 });
      bleat(ac, 0.17, { pitch: 600, length: 0.12 });
    },
  },
  pig: {
    happy: (ac) => oink(ac, 0),
    cheer: (ac) => {
      oink(ac, 0);
      oink(ac, 0.24, { pitch: 210 });
      voice(ac, 0.5, { pitch: [[0, 800], [0.12, 1250], [0.28, 950]], f1: 900, f2: 2400, length: 0.28, peak: 0.35 });
    },
    wow: (ac) => oink(ac, 0, { pitch: 180, length: 0.24, ask: true }),
    think: (ac) => {
      oink(ac, 0, { pitch: 140, length: 0.14, peak: 0.5 });
      oink(ac, 0.2, { pitch: 130, length: 0.14, peak: 0.5 });
    },
    huh: (ac) => oink(ac, 0, { pitch: 200, length: 0.22, ask: true }),
    sad: (ac) => oink(ac, 0, { pitch: 190, length: 0.42, sad: true }),
    giggle: (ac) => {
      snort(ac, 0);
      snort(ac, 0.11);
      oink(ac, 0.22, { pitch: 230, length: 0.14 });
    },
  },
};

const SHARED = {
  boing: (ac) => tone(ac, 0, { wave: 'triangle', pitch: [[0, 240], [0.12, 560], [0.32, 300]], length: 0.32, peak: 0.2, vibrato: { rate: 18, depth: 25 } }),
  wheee: (ac) => tone(ac, 0, { pitch: [[0, 600], [0.35, 1400]], length: 0.35, peak: 0.12, attack: 0.03 }),
  dizzy: (ac) => tone(ac, 0, { wave: 'triangle', pitch: [[0, 820], [0.6, 440]], length: 0.6, peak: 0.16, vibrato: { rate: 9, depth: 90 } }),
};

/** Schedules the sound on `ac`. Exported so tests can run it against a fake context. */
export function scheduleBuddySound(ac, kind, cue) {
  const mood = CUES[cue] || cue;
  if (SHARED[mood]) {
    SHARED[mood](ac);
    return true;
  }
  const sounds = VOICES[kind] || VOICES.robot;
  if (mood === 'phew') {
    hiss(ac, 0, { type: 'lowpass', freq: [[0, 1200], [0.45, 450]], q: 0.7, length: 0.45, peak: 0.22, attack: 0.1, release: 0.2 });
    sounds.happy(later(ac, 0.45));
    return true;
  }
  if (!sounds[mood]) return false;
  sounds[mood](ac);
  return true;
}

/** Plays the companion's voice for a reaction. Browsers only allow sound after a tap. */
export function playBuddySound(kind, cue) {
  const ac = audio();
  if (!ac) return;
  try {
    scheduleBuddySound(ac, kind, cue);
  } catch {}
}
