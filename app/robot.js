'use client';

import { useEffect, useRef, useState } from 'react';

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
  add: { face: 'wow', anim: 'hop', say: ['Ooh, a new one!', 'Got it!', 'On the list!'] },
  edit: { face: 'think', anim: 'tilt', say: ['Hmm, changes!', 'Noted.', 'All updated.'] },
  done: { face: 'joy', anim: 'hop', burst: 'spark', say: ['Nice work!', 'Boom, done!', 'Yay!', 'One less thing!'] },
  late: { face: 'phew', anim: 'tilt', say: ['Phew, done!', 'Better late than never!', 'Finally!'] },
  clear: { face: 'joy', anim: 'spin', burst: 'spark', say: ['All caught up!', 'Nothing due. Yay!'] },
  step: { face: 'happy', anim: 'hop', say: ['Step done!', 'Nice!'] },
  habit: { face: 'joy', anim: 'hop', burst: 'heart', say: ['Keep it up!', 'Habit done!', 'Streak!'] },
  allhabits: { face: 'joy', anim: 'spin', burst: 'heart', say: ['All habits done!', 'Perfect day!'] },
  newhabit: { face: 'wow', anim: 'hop', burst: 'spark', say: ['New habit!', "Let's do it daily!"] },
  list: { face: 'wow', anim: 'hop', say: ['A new list!', 'Fresh list!'] },
  remind: { face: 'happy', anim: 'hop', say: ["I'll remind you!", 'Reminders set!'] },
  log: { face: 'joy', anim: 'hop', say: ['Logged!', 'Look at you go!'] },
  undo: { face: 'huh', anim: 'tilt', say: ['Huh? Back on?', 'Oops?', 'Okay, undone.'] },
  bye: { face: 'bye', anim: 'shake', say: ['Bye bye!', 'Poof!', 'Gone!'] },
  restore: { face: 'happy', anim: 'hop', say: ['Welcome back!', 'Saved it!'] },
  poke: { face: 'giggle', anim: 'wiggle', say: ['Hehe!', 'That tickles!', 'Boop!', 'Hi there!'] },
  pokesad: { face: 'sad', anim: 'wiggle', say: ['Boop… something is still overdue.', 'Help me with the late one?'] },
  dizzy: { face: 'dizzy', anim: 'spin', ms: 2200, say: ['Whoa, dizzy…', 'Too many boops!'] },
  boing: { face: 'giggle', anim: 'hop', say: ['Boing!', 'Again!', 'Wheee!'] },
};

const HELLO = {
  sad: { face: 'sad', anim: 'tilt', say: ["Something's overdue…", 'Can we finish the late one?'] },
  proud: { face: 'joy', anim: 'hop', burst: 'spark', say: ['All done today!', 'Look at us go!'] },
  happy: { face: 'happy', anim: 'hop', say: ['Good going!', 'Nice day so far!'] },
  okay: { face: 'giggle', anim: 'wiggle', say: ['Hi!', 'Hello!', 'Ready when you are!'] },
};

const MOOD_WORDS = { okay: 'calm', happy: 'happy', proud: 'proud', sad: 'sad' };

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

export default function Robot({ mood = 'okay', cue }) {
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
  const moodRef = useRef(mood);
  moodRef.current = mood;

  function show(spec) {
    clearTimeout(timer.current);
    setReaction({ ...spec, say: pick(spec.say), key: Math.random() });
    timer.current = setTimeout(() => setReaction(null), spec.ms || 1900);
  }

  useEffect(() => {
    if (cue && REACTIONS[cue.type]) show(REACTIONS[cue.type]);
  }, [cue]);

  useEffect(() => {
    const hello = setTimeout(() => show(HELLO[moodRef.current] || HELLO.okay), 600);
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
    show(REACTIONS.boing);
  }

  function onClick() {
    if (skipClick.current) return;
    const now = Date.now();
    pokes.current = pokes.current.filter((at) => now - at < 2500);
    pokes.current.push(now);
    if (pokes.current.length >= 5) {
      pokes.current = [];
      show(REACTIONS.dizzy);
      return;
    }
    show(moodRef.current === 'sad' && Math.random() < 0.4 ? REACTIONS.pokesad : REACTIONS.poke);
  }

  const face = FACES[drag ? 'wheee' : reaction?.face || mood] || FACES.okay;
  const anim = drag ? 'held' : reaction?.anim || 'idle';
  const say = drag ? 'Wheee!' : reaction?.say;
  const bodyKey = drag ? 'held' : reaction?.key || 'idle';
  let className = `robot mood-${mood}`;
  if (drag) className += ' is-held';
  if (home) className += ' is-home';

  return (
    <span className="robot-spot">
      <button
        ref={ref}
        type="button"
        className={className}
        style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
        aria-label={`Daymark robot, feeling ${MOOD_WORDS[mood] || 'calm'}. Tap to play.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        <span key={bodyKey} className={`robot-body ${anim}`}>
          <Face face={face} look={face.look || look} shut={shut} />
        </span>
        {reaction?.burst && !drag ? <Burst key={`b${reaction.key}`} kind={reaction.burst} /> : null}
        {say ? (
          <span key={`s${bodyKey}`} className="robot-say" aria-hidden="true">
            {say}
          </span>
        ) : null}
      </button>
    </span>
  );
}

function Face({ face, look, shut }) {
  const [lx, ly] = look;
  const blinks = face.eyes === 'open' || face.eyes === 'wide' || face.eyes === 'droop';
  return (
    <svg viewBox="0 0 64 64" className="robot-svg" aria-hidden="true">
      <line x1="32" y1="13" x2="32" y2="6.5" className="r-stalk" />
      <circle cx="32" cy="5" r="3.2" className="r-bulb" />
      <rect x="3" y="27" width="6" height="12" rx="3" className="r-ear" />
      <rect x="55" y="27" width="6" height="12" rx="3" className="r-ear" />
      <rect x="7.5" y="12.5" width="49" height="41" rx="14" className="r-head" />
      <path d="M13.5 19 q3.5 -3 9 -3.4" className="r-shine" />
      <rect x="13" y="19.5" width="38" height="28" rx="10" className="r-screen" />
      {face.cheeks ? (
        <>
          <ellipse cx="19" cy="40.5" rx="3.4" ry="2.1" className="r-cheek" />
          <ellipse cx="45" cy="40.5" rx="3.4" ry="2.1" className="r-cheek" />
        </>
      ) : null}
      <g transform={`translate(${lx.toFixed(2)} ${ly.toFixed(2)})`}>
        <g className={blinks && shut ? 'r-blink is-shut' : 'r-blink'}>
          <Eye kind={face.eyes} cx={24} side="left" />
          <Eye kind={face.eyes} cx={40} side="right" />
        </g>
      </g>
      {face.brow ? <path d="M36.5 23.2 L43.5 21.8" className="r-line thin" /> : null}
      <Mouth kind={face.mouth} />
      {face.sweat ? (
        <path d="M48 20c1.6 2.3 2.4 3.6 2.4 4.7a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.4 2.4-4.7z" className="r-drop" />
      ) : null}
      {face.tear ? (
        <path d="M19.6 35.2c1.1 1.6 1.7 2.5 1.7 3.3a1.7 1.7 0 0 1-3.4 0c0-.8.6-1.7 1.7-3.3z" className="r-drop r-tear" />
      ) : null}
    </svg>
  );
}

function Eye({ kind, cx, side }) {
  const cy = 31;
  if (kind === 'happy') {
    return <path d={`M${cx - 4.2} ${cy + 1.6} Q${cx} ${cy - 4} ${cx + 4.2} ${cy + 1.6}`} className="r-line" />;
  }
  if (kind === 'closed') {
    return <path d={`M${cx - 4} ${cy} Q${cx} ${cy + 2.6} ${cx + 4} ${cy}`} className="r-line" />;
  }
  if (kind === 'dizzy') {
    return (
      <g>
        <circle cx={cx} cy={cy} r="4" className="r-ring" />
        <circle cx={cx + 0.5} cy={cy - 0.4} r="1.5" className="r-ring" />
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
      <circle cx={cx} cy={cy} r={r} className="r-eye" />
      <circle cx={cx - 1.4} cy={cy - 1.5} r={kind === 'wide' ? 1.5 : 1.2} className="r-glint" />
      {lid ? <path d={lid} className="r-lid" /> : null}
    </g>
  );
}

function Mouth({ kind }) {
  if (kind === 'grin') return <path d="M24.5 38 Q32 48 39.5 38 Z" className="r-fill" />;
  if (kind === 'smile') return <path d="M25 39 Q32 45 39 39" className="r-line" />;
  if (kind === 'small') return <path d="M27.5 40 Q32 43 36.5 40" className="r-line" />;
  if (kind === 'frown') return <path d="M26 43.5 Q32 38 38 43.5" className="r-line" />;
  if (kind === 'o') return <ellipse cx="32" cy="41" rx="2.8" ry="3.3" className="r-ring" />;
  if (kind === 'open') return <ellipse cx="32" cy="40.5" rx="4.6" ry="3.7" className="r-fill" />;
  if (kind === 'wavy') return <path d="M25.5 41 q1.6 -2 3.25 0 t3.25 0 t3.25 0 t3.25 0" className="r-line" />;
  if (kind === 'smirk') return <path d="M27 42 Q33 41.5 38 38.5" className="r-line" />;
  return <path d="M27 41 h10" className="r-line" />;
}

function Burst({ kind }) {
  return (
    <span className="robot-burst" aria-hidden="true">
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
