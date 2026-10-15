'use client';

import { useEffect, useRef, useState } from 'react';
import { playBuddySound } from './sounds';

export const KIND_LABELS = { robot: 'Robot', cat: 'Cat', puppy: 'Puppy', bunny: 'Bunny', panda: 'Panda', pig: 'Pig' };
export const STYLE_LABELS = { plain: 'Plain', girl: 'Girl', boy: 'Boy' };

const DEFAULT_NAMES = { robot: 'Robo', cat: 'Mochi', puppy: 'Biscuit', bunny: 'Bun', panda: 'Bao', pig: 'Truffle' };

export function buddyName(companion) {
  return companion?.name || DEFAULT_NAMES[companion?.kind] || DEFAULT_NAMES.robot;
}

export function defaultBuddyName(kind) {
  return DEFAULT_NAMES[kind] || DEFAULT_NAMES.robot;
}

const FACES = {
  okay: { eyes: 'open', mouth: 'small' },
  happy: { eyes: 'open', mouth: 'smile', cheeks: true },
  proud: { eyes: 'happy', mouth: 'grin', cheeks: true },
  sad: { eyes: 'droop', mouth: 'frown', tear: true },
  wow: { eyes: 'wide', mouth: 'o' },
  think: { eyes: 'open', mouth: 'wavy', look: [1.8, -1.9] },
  joy: { eyes: 'happy', mouth: 'grin', cheeks: true },
  phew: { eyes: 'closed', mouth: 'small', sweat: true },
  huh: { eyes: 'open', mouth: 'smirk', brow: true },
  bye: { eyes: 'droop', mouth: 'o' },
  giggle: { eyes: 'happy', mouth: 'open', cheeks: true },
  dizzy: { eyes: 'dizzy', mouth: 'wavy' },
  wheee: { eyes: 'wide', mouth: 'open', cheeks: true },
};

const REACTIONS = {
  add: { face: 'wow', anim: 'hop', say: ['Ooh, a new one!', 'Got it!', 'On the list, {name}!'] },
  edit: { face: 'think', anim: 'tilt', say: ['Hmm, changes!', 'Noted.', 'All updated.'] },
  done: { face: 'joy', anim: 'hop', burst: 'spark', say: ['Nice work!', 'Boom, done!', 'Yay, {name}!', 'One less thing!'] },
  late: { face: 'phew', anim: 'tilt', say: ['Phew, done!', 'Better late than never!', 'Finally, {name}!'] },
  clear: { face: 'joy', anim: 'spin', burst: 'spark', say: ['All caught up!', 'Nothing due. Yay, {name}!'] },
  step: { face: 'happy', anim: 'hop', say: ['Step done!', 'Nice!'] },
  habit: { face: 'joy', anim: 'hop', burst: 'heart', say: ['Keep it up!', 'Habit done!', 'Streak, {name}!'] },
  allhabits: { face: 'joy', anim: 'spin', burst: 'heart', say: ['All habits done!', 'Perfect day, {name}!'] },
  newhabit: { face: 'wow', anim: 'hop', burst: 'spark', say: ['New habit!', "Let's do it daily!"] },
  list: { face: 'wow', anim: 'hop', say: ['A new list!', 'Fresh list!'] },
  remind: { face: 'happy', anim: 'hop', say: ["I'll remind you!", "I'll remind you, {name}!"] },
  log: { face: 'joy', anim: 'hop', say: ['Logged!', 'Look at you go!'] },
  undo: { face: 'huh', anim: 'tilt', say: ['Huh? Back on?', 'Oops?', 'Okay, undone.'] },
  bye: { face: 'bye', anim: 'shake', say: ['Bye bye!', 'Poof!', 'Gone!'] },
  restore: { face: 'happy', anim: 'hop', say: ['Welcome back!', 'Saved it!'] },
  poke: { face: 'giggle', anim: 'wiggle', say: ['Hehe!', 'That tickles!', 'Boop!', 'Hi {name}!', "It's me, {pet}!"] },
  pokesad: { face: 'sad', anim: 'wiggle', say: ['Boop… something is still overdue.', 'Help me with the late one, {name}?'] },
  dizzy: { face: 'dizzy', anim: 'spin', ms: 2200, say: ['Whoa, dizzy…', 'Too many boops!'] },
  boing: { face: 'giggle', anim: 'hop', say: ['Boing!', 'Again!', 'Wheee!'] },
  meet: { face: 'joy', anim: 'hop', burst: 'heart', say: ['Nice to meet you, {name}!', "Hi {name}, I'm {pet}!"] },
  newlook: { face: 'wow', anim: 'spin', burst: 'spark', say: ['How do I look?', "I'm {pet} now!", 'New me!'] },
};

const HELLO = {
  sad: { face: 'sad', anim: 'tilt', say: ["Something's overdue…", "{name}, something's overdue…"] },
  proud: { face: 'joy', anim: 'hop', burst: 'spark', say: ['All done today!', 'All done today, {name}!'] },
  happy: { face: 'happy', anim: 'hop', say: ['Good going!', 'Good going, {name}!'] },
  okay: { face: 'giggle', anim: 'wiggle', say: ['Hello!', 'Hi {name}!'] },
};

const KIND_POKES = {
  robot: ['Beep boop!'],
  cat: ['Meow!', 'Purr…'],
  puppy: ['Woof!', 'Arf arf!'],
  bunny: ['Hop hop!'],
  panda: ['Nom nom!'],
  pig: ['Oink!', 'Oink oink!', 'Snrk!'],
};

const MOOD_WORDS = { okay: 'calm', happy: 'happy', proud: 'proud', sad: 'sad' };

const BOW_SPOTS = { robot: [45.5, 12.5], cat: [44, 17.5], puppy: [45, 14.5], bunny: [44, 21], panda: [45, 15], pig: [44, 16] };

const BITS = [
  [-26, -20],
  [-14, -32],
  [0, -38],
  [14, -32],
  [26, -20],
  [32, -4],
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function speak(list, names, preferName) {
  const named = list.filter((text) => text.includes('{name}'));
  const plain = list.filter((text) => !text.includes('{name}'));
  let pool = names.user ? list : plain;
  if (names.user && preferName && named.length > 0) pool = named;
  if (pool.length === 0) return 'Hi!';
  return pick(pool).replaceAll('{name}', names.user).replaceAll('{pet}', names.pet);
}

export default function Buddy({ mood = 'okay', cue, companion, sound = false }) {
  const kind = companion?.kind || 'robot';
  const style = companion?.style || 'plain';
  const names = { user: companion?.user || '', pet: buddyName(companion) };
  const [reaction, setReaction] = useState(null);
  const [shut, setShut] = useState(false);
  const [look, setLook] = useState([0, 0]);
  const [drag, setDrag] = useState(null);
  const [home, setHome] = useState(false);
  const ref = useRef(null);
  const timer = useRef(0);
  const homeTimer = useRef(0);
  const pokes = useRef([]);
  const press = useRef(null);
  const skipClick = useRef(false);
  const latest = useRef({ mood, names, kind, sound });
  latest.current = { mood, names, kind, sound };

  function show(spec, { lines, preferName, voice } = {}) {
    clearTimeout(timer.current);
    const say = speak(lines || spec.say, latest.current.names, preferName);
    setReaction({ ...spec, say, key: Math.random() });
    timer.current = setTimeout(() => setReaction(null), spec.ms || 1900);
    if (voice && latest.current.sound) playBuddySound(latest.current.kind, voice);
  }

  useEffect(() => {
    if (cue && REACTIONS[cue.type]) show(REACTIONS[cue.type], { preferName: cue.type === 'meet', voice: cue.type });
  }, [cue]);

  useEffect(() => {
    const hello = setTimeout(() => show(HELLO[latest.current.mood] || HELLO.okay, { preferName: true }), 600);
    return () => {
      clearTimeout(hello);
      clearTimeout(timer.current);
      clearTimeout(homeTimer.current);
    };
  }, []);

  useEffect(() => {
    let wait = 0;
    let reopen = 0;
    const next = () => {
      wait = setTimeout(() => {
        setShut(true);
        reopen = setTimeout(() => setShut(false), 130);
        next();
      }, 2400 + Math.random() * 3600);
    };
    next();
    return () => {
      clearTimeout(wait);
      clearTimeout(reopen);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const follow = (event) => {
      if (frame) return;
      const { clientX, clientY } = event;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        const dx = clientX - (box.left + box.width / 2);
        const dy = clientY - (box.top + box.height / 2);
        const length = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, length / 160);
        setLook([(dx / length) * 2.2 * reach, (dy / length) * 1.8 * reach]);
      });
    };
    window.addEventListener('pointermove', follow, { passive: true });
    window.addEventListener('pointerdown', follow, { passive: true });
    return () => {
      window.removeEventListener('pointermove', follow);
      window.removeEventListener('pointerdown', follow);
      cancelAnimationFrame(frame);
    };
  }, []);

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    press.current = { x: event.clientX, y: event.clientY, moved: false };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }

  function onPointerMove(event) {
    const held = press.current;
    if (!held) return;
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    if (!held.moved && Math.hypot(dx, dy) < 6) return;
    if (!held.moved) {
      held.moved = true;
      clearTimeout(timer.current);
      clearTimeout(homeTimer.current);
      setReaction(null);
      setHome(false);
      if (latest.current.sound) playBuddySound(latest.current.kind, 'wheee');
    }
    setDrag({ x: dx, y: dy });
  }

  function onPointerUp() {
    const held = press.current;
    press.current = null;
    if (!held?.moved) return;
    skipClick.current = true;
    setTimeout(() => {
      skipClick.current = false;
    }, 350);
    setDrag(null);
    setHome(true);
    homeTimer.current = setTimeout(() => setHome(false), 600);
    show(REACTIONS.boing, { voice: 'boing' });
  }

  function onClick() {
    if (skipClick.current) return;
    const now = Date.now();
    pokes.current = pokes.current.filter((at) => now - at < 2500);
    pokes.current.push(now);
    if (pokes.current.length >= 5) {
      pokes.current = [];
      show(REACTIONS.dizzy, { voice: 'dizzy' });
      return;
    }
    if (latest.current.mood === 'sad' && Math.random() < 0.4) {
      show(REACTIONS.pokesad, { voice: 'pokesad' });
      return;
    }
    show(REACTIONS.poke, { lines: [...REACTIONS.poke.say, ...(KIND_POKES[latest.current.kind] || [])], voice: 'poke' });
  }

  const face = FACES[drag ? 'wheee' : reaction?.face || mood] || FACES.okay;
  const anim = drag ? 'held' : reaction?.anim || 'idle';
  const say = drag ? 'Wheee!' : reaction?.say;
  const bodyKey = drag ? 'held' : reaction?.key || 'idle';
  let className = `buddy mood-${mood}`;
  if (drag) className += ' is-held';
  if (home) className += ' is-home';

  return (
    <span className="buddy-spot">
      <button
        ref={ref}
        type="button"
        className={className}
        style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
        aria-label={`${names.pet} the ${KIND_LABELS[kind].toLowerCase()}, feeling ${MOOD_WORDS[mood] || 'calm'}. Tap to play.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        <span key={bodyKey} className={`buddy-body ${anim}`}>
          <Face kind={kind} style={style} face={face} look={face.look || look} shut={shut} />
        </span>
        {reaction?.burst && !drag ? <Burst key={`b${reaction.key}`} kind={reaction.burst} /> : null}
        {say ? (
          <span key={`s${bodyKey}`} className="buddy-say" aria-hidden="true">
            {say}
          </span>
        ) : null}
      </button>
    </span>
  );
}

export function BuddyPreview({ kind = 'robot', style = 'plain', mood = 'happy', small = false }) {
  return (
    <span className={small ? 'buddy-preview small' : 'buddy-preview'} aria-hidden="true">
      <Face kind={kind} style={style} face={FACES[mood] || FACES.happy} look={[0, 0]} shut={false} />
    </span>
  );
}

function Face({ kind, style, face, look, shut }) {
  const [lx, ly] = look;
  const blinks = face.eyes === 'open' || face.eyes === 'wide' || face.eyes === 'droop';
  const lashes = style === 'girl' && face.eyes !== 'closed' && face.eyes !== 'dizzy';
  const cheeks = face.cheeks || style === 'girl';
  const [bx, by] = BOW_SPOTS[kind] || BOW_SPOTS.robot;
  return (
    <svg viewBox="0 0 64 64" className={`buddy-svg k-${kind}`} aria-hidden="true">
      <Head kind={kind} />
      {cheeks ? (
        <>
          <ellipse cx="19" cy="40.5" rx="3.4" ry="2.1" className={face.cheeks ? 'f-cheek' : 'f-cheek soft'} />
          <ellipse cx="45" cy="40.5" rx="3.4" ry="2.1" className={face.cheeks ? 'f-cheek' : 'f-cheek soft'} />
        </>
      ) : null}
      <g transform={`translate(${lx.toFixed(2)} ${ly.toFixed(2)})`}>
        <g className={blinks && shut ? 'f-blink is-shut' : 'f-blink'}>
          <Eye kind={face.eyes} cx={24} side="left" />
          <Eye kind={face.eyes} cx={40} side="right" />
          {lashes ? <path d="M19.4 27.4l-2.1-1.5M21.2 26.1l-1.1-2M44.6 27.4l2.1-1.5M42.8 26.1l1.1-2" className="e-line thin" /> : null}
        </g>
      </g>
      {face.brow ? <path d="M36.5 23.2 L43.5 21.8" className="e-line thin" /> : null}
      <Nose kind={kind} />
      {kind === 'pig' ? (
        <g transform="translate(0 7)">
          <Mouth kind={face.mouth} />
        </g>
      ) : (
        <Mouth kind={face.mouth} />
      )}
      {face.sweat ? (
        <path d="M48 20c1.6 2.3 2.4 3.6 2.4 4.7a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.4 2.4-4.7z" className="f-drop" />
      ) : null}
      {face.tear ? (
        <path d="M19.6 35.2c1.1 1.6 1.7 2.5 1.7 3.3a1.7 1.7 0 0 1-3.4 0c0-.8.6-1.7 1.7-3.3z" className="f-drop f-tear" />
      ) : null}
      {style === 'girl' ? (
        <g transform={`translate(${bx} ${by}) rotate(18)`}>
          <path d="M0 0 L-6.4 -3.8 Q-7.8 0 -6.4 3.8 Z" className="acc-bow" />
          <path d="M0 0 L6.4 -3.8 Q7.8 0 6.4 3.8 Z" className="acc-bow" />
          <circle r="1.9" className="acc-bow-knot" />
        </g>
      ) : null}
      {style === 'boy' ? (
        <g transform="translate(32 57.5)">
          <path d="M0 0 L-6.8 -3.6 L-6.8 3.6 Z" className="acc-tie" />
          <path d="M0 0 L6.8 -3.6 L6.8 3.6 Z" className="acc-tie" />
          <rect x="-1.9" y="-1.9" width="3.8" height="3.8" rx="1" className="acc-tie-knot" />
        </g>
      ) : null}
    </svg>
  );
}

function Head({ kind }) {
  if (kind === 'cat') {
    return (
      <>
        <path d="M11.5 23 L14 4.5 L27.5 14.5 Z" className="b-fur" />
        <path d="M15.4 17.5 L16.7 8.8 L23.6 14 Z" className="b-inner" />
        <path d="M52.5 23 L50 4.5 L36.5 14.5 Z" className="b-fur" />
        <path d="M48.6 17.5 L47.3 8.8 L40.4 14 Z" className="b-inner" />
        <ellipse cx="32" cy="34" rx="25" ry="21" className="b-fur" />
        <ellipse cx="32" cy="41.5" rx="11" ry="7.5" className="b-muzzle" />
        <path d="M7.5 36.5 L18 38 M8 42 L18 40.8 M56.5 36.5 L46 38 M56 42 L46 40.8" className="b-whisker" />
      </>
    );
  }
  if (kind === 'puppy') {
    return (
      <>
        <ellipse cx="32" cy="33.5" rx="23.5" ry="21" className="b-fur" />
        <ellipse cx="41" cy="27.5" rx="7.5" ry="6.5" className="b-spot" />
        <path d="M13 15 C4.5 16.5 2 33 7.5 40.5 C10.2 44 14.6 40.6 15 35.5 Z" className="b-ear" />
        <path d="M51 15 C59.5 16.5 62 33 56.5 40.5 C53.8 44 49.4 40.6 49 35.5 Z" className="b-ear" />
        <ellipse cx="32" cy="41.5" rx="11" ry="8" className="b-muzzle" />
      </>
    );
  }
  if (kind === 'bunny') {
    return (
      <>
        <ellipse cx="23.5" cy="12.5" rx="5.6" ry="12" transform="rotate(-8 23.5 12.5)" className="b-fur" />
        <ellipse cx="23.5" cy="13" rx="2.6" ry="8.4" transform="rotate(-8 23.5 13)" className="b-inner" />
        <ellipse cx="40.5" cy="12.5" rx="5.6" ry="12" transform="rotate(8 40.5 12.5)" className="b-fur" />
        <ellipse cx="40.5" cy="13" rx="2.6" ry="8.4" transform="rotate(8 40.5 13)" className="b-inner" />
        <ellipse cx="32" cy="36" rx="23" ry="19" className="b-fur" />
      </>
    );
  }
  if (kind === 'pig') {
    return (
      <>
        <path d="M12.5 23 L11.5 7 L26 13.5 Z" className="b-fur" />
        <path d="M15.2 18.6 L14.8 10.8 L22 14.2 Z" className="b-inner" />
        <path d="M51.5 23 L52.5 7 L38 13.5 Z" className="b-fur" />
        <path d="M48.8 18.6 L49.2 10.8 L42 14.2 Z" className="b-inner" />
        <ellipse cx="32" cy="34" rx="25" ry="21" className="b-fur" />
      </>
    );
  }
  if (kind === 'panda') {
    return (
      <>
        <circle cx="14" cy="16.5" r="7.5" className="b-patch" />
        <circle cx="50" cy="16.5" r="7.5" className="b-patch" />
        <ellipse cx="32" cy="34" rx="25" ry="21" className="b-fur" />
        <ellipse cx="23" cy="31.5" rx="6.8" ry="5.6" transform="rotate(-25 23 31.5)" className="b-patch" />
        <ellipse cx="41" cy="31.5" rx="6.8" ry="5.6" transform="rotate(25 41 31.5)" className="b-patch" />
      </>
    );
  }
  return (
    <>
      <line x1="32" y1="13" x2="32" y2="6.5" className="r-stalk" />
      <circle cx="32" cy="5" r="3.2" className="r-bulb" />
      <rect x="3" y="27" width="6" height="12" rx="3" className="r-ear" />
      <rect x="55" y="27" width="6" height="12" rx="3" className="r-ear" />
      <rect x="7.5" y="12.5" width="49" height="41" rx="14" className="r-head" />
      <path d="M13.5 19 q3.5 -3 9 -3.4" className="r-shine" />
      <rect x="13" y="19.5" width="38" height="28" rx="10" className="r-screen" />
    </>
  );
}

function Nose({ kind }) {
  if (kind === 'cat' || kind === 'bunny') return <path d="M30.3 35.4 h3.4 l-1.7 2 z" className="b-nose" />;
  if (kind === 'puppy') return <ellipse cx="32" cy="36.4" rx="2.6" ry="1.8" className="b-nose" />;
  if (kind === 'panda') return <ellipse cx="32" cy="36.6" rx="2.3" ry="1.5" className="b-nose" />;
  if (kind === 'pig') {
    return (
      <>
        <ellipse cx="32" cy="39" rx="8.5" ry="5.8" className="b-snout" />
        <ellipse cx="29" cy="39" rx="1.4" ry="2.1" className="b-nose" />
        <ellipse cx="35" cy="39" rx="1.4" ry="2.1" className="b-nose" />
      </>
    );
  }
  return null;
}

function Eye({ kind, cx, side }) {
  const cy = 31;
  if (kind === 'happy') {
    return <path d={`M${cx - 4.2} ${cy + 1.6} Q${cx} ${cy - 4} ${cx + 4.2} ${cy + 1.6}`} className="e-line" />;
  }
  if (kind === 'closed') {
    return <path d={`M${cx - 4} ${cy} Q${cx} ${cy + 2.6} ${cx + 4} ${cy}`} className="e-line" />;
  }
  if (kind === 'dizzy') {
    return (
      <g>
        <circle cx={cx} cy={cy} r="4" className="e-ring" />
        <circle cx={cx + 0.5} cy={cy - 0.4} r="1.5" className="e-ring" />
      </g>
    );
  }
  const r = kind === 'wide' ? 5 : 4.2;
  let lid = null;
  if (kind === 'droop') {
    lid =
      side === 'left'
        ? `M${cx - 6} ${cy - 6} H${cx + 6} V${cy - 3.4} L${cx - 6} ${cy + 0.4} Z`
        : `M${cx - 6} ${cy - 6} H${cx + 6} V${cy + 0.4} L${cx - 6} ${cy - 3.4} Z`;
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="e-fill" />
      <circle cx={cx - 1.4} cy={cy - 1.5} r={kind === 'wide' ? 1.5 : 1.2} className="e-glint" />
      {lid ? <path d={lid} className="e-lid" /> : null}
    </g>
  );
}

function Mouth({ kind }) {
  if (kind === 'grin') return <path d="M24.5 38.5 Q32 48 39.5 38.5 Z" className="m-fill" />;
  if (kind === 'smile') return <path d="M25 39.5 Q32 45 39 39.5" className="m-line" />;
  if (kind === 'small') return <path d="M27.5 40.5 Q32 43.2 36.5 40.5" className="m-line" />;
  if (kind === 'frown') return <path d="M26 44 Q32 38.5 38 44" className="m-line" />;
  if (kind === 'o') return <ellipse cx="32" cy="41.5" rx="2.8" ry="3.3" className="m-ring" />;
  if (kind === 'open') return <ellipse cx="32" cy="41" rx="4.6" ry="3.7" className="m-fill" />;
  if (kind === 'wavy') return <path d="M25.5 41.5 q1.6 -2 3.25 0 t3.25 0 t3.25 0 t3.25 0" className="m-line" />;
  if (kind === 'smirk') return <path d="M27 42.5 Q33 42 38 39" className="m-line" />;
  return <path d="M27 41.5 h10" className="m-line" />;
}

function Burst({ kind }) {
  return (
    <span className="buddy-burst" aria-hidden="true">
      {BITS.map(([dx, dy], index) => (
        <span
          key={index}
          className={`bit ${kind}`}
          style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, animationDelay: `${index * 35}ms` }}
        >
          <svg viewBox="0 0 12 12">
            {kind === 'heart' ? (
              <path d="M6 10.6 1.7 6.3a2.6 2.6 0 0 1 4.3-3.5 2.6 2.6 0 0 1 4.3 3.5z" />
            ) : (
              <path d="M6 0l1.3 4.7L12 6l-4.7 1.3L6 12 4.7 7.3 0 6l4.7-1.3z" />
            )}
          </svg>
        </span>
      ))}
    </span>
  );
}
