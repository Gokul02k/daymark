const VOICES = {
  robot: { type: 'square', base: 660, bend: 1, dur: 0.09, gain: 0.06, filter: 2400 },
  cat: { type: 'sine', base: 900, bend: 1.18, dur: 0.16, gain: 0.16, vibrato: 14 },
  puppy: { type: 'triangle', base: 430, bend: 0.72, dur: 0.1, gain: 0.2 },
  bunny: { type: 'sine', base: 1300, bend: 1.25, dur: 0.06, gain: 0.13 },
  panda: { type: 'triangle', base: 310, bend: 0.9, dur: 0.15, gain: 0.2 },
};

// [semitones above the voice's base pitch, start offset in seconds, length multiplier, pitch shape]
const TUNES = {
  happy: [[0, 0], [4, 0.1], [7, 0.2]],
  cheer: [[0, 0], [4, 0.09], [7, 0.18], [12, 0.27, 1.6]],
  wow: [[-3, 0, 2.2, 'rise']],
  think: [[0, 0], [-3, 0.14]],
  huh: [[0, 0, 1.6, 'rise']],
  sad: [[3, 0, 1.4], [0, 0.18, 1.4], [-4, 0.36, 2.2, 'fall']],
  bye: [[5, 0, 1.4, 'fall'], [0, 0.2, 2, 'fall']],
  giggle: [[7, 0], [9, 0.07], [12, 0.14]],
  dizzy: [[7, 0, 6, 'wobble']],
  boing: [[-5, 0, 2.6, 'spring']],
  wheee: [[0, 0, 3.5, 'rise']],
  phew: [[4, 0, 1.6], [0, 0.18, 2.2]],
};

const CUE_TUNES = {
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
  bye: 'bye',
  poke: 'giggle',
  pokesad: 'sad',
  dizzy: 'dizzy',
  boing: 'boing',
  wheee: 'wheee',
};

const SHAPE_RATIO = { rise: 1.6, fall: 0.6, wobble: 0.55 };

let context = null;
let output = null;

function audio() {
  if (typeof window === 'undefined') return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  try {
    if (!context) {
      context = new Context();
      output = context.createDynamicsCompressor();
      output.threshold.value = -16;
      output.connect(context.destination);
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  } catch {
    return null;
  }
}

function note(ac, voice, [semitones, offset = 0, stretch = 1, shape]) {
  const start = ac.currentTime + 0.01 + offset;
  const length = voice.dur * stretch;
  const end = start + length;
  const from = voice.base * 2 ** (semitones / 12);
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = voice.type;
  osc.frequency.setValueAtTime(from, start);
  if (shape === 'spring') {
    osc.frequency.exponentialRampToValueAtTime(from * 2.2, start + length * 0.45);
    osc.frequency.exponentialRampToValueAtTime(from * 1.1, end);
  } else {
    osc.frequency.exponentialRampToValueAtTime(from * (SHAPE_RATIO[shape] || voice.bend), end);
  }
  const wobble = shape === 'wobble' ? from * 0.12 : voice.vibrato || 0;
  if (wobble) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = shape === 'wobble' ? 9 : 16;
    depth.gain.value = wobble;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(start);
    lfo.stop(end + 0.05);
  }
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(voice.gain, start + Math.min(0.015, length / 3));
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  let source = osc;
  if (voice.filter) {
    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = voice.filter;
    osc.connect(lowpass);
    source = lowpass;
  }
  source.connect(amp);
  amp.connect(output);
  osc.start(start);
  osc.stop(end + 0.03);
}

/** Plays the companion's little voice for a reaction. Browsers only allow it after a tap. */
export function playBuddySound(kind, cue) {
  const tune = TUNES[CUE_TUNES[cue] || cue];
  if (!tune) return;
  const ac = audio();
  if (!ac) return;
  const voice = VOICES[kind] || VOICES.robot;
  try {
    for (const step of tune) note(ac, voice, step);
  } catch {}
}
