'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addList,
  addTask,
  childrenOf,
  cleanTitle,
  deleteList,
  deleteTask,
  doneTasks,
  dueChoice,
  groupOpenTasks,
  mergeBoards,
  normalizeBoard,
  reminderMessage,
  remindersDue,
  reorderTasks,
  resolveDue,
  restoreList,
  restoreTasks,
  sameBand,
  setDone,
  todayKey,
  updateTask,
} from './lib/board';
import {
  loadPasscode,
  loadSelectedList,
  loadState,
  savePasscode,
  savePersisted,
  saveSelectedList,
} from './lib/storage';

const GROUPS = [
  ['overdue', 'Overdue'],
  ['today', 'Today'],
  ['later', 'Later'],
  ['none', 'No date limit'],
];

const DUE_CHOICES = [
  ['none', 'No date limit'],
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['pick', 'Pick a date'],
];

const PRIORITY_CHOICES = [
  ['none', 'None'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
];

const PRIORITY_MARK = { low: '!', medium: '!!', high: '!!!' };

const REMIND_NOTE = {
  push: 'Arrives around 9 AM, even when Daymark is closed.',
  open: 'Arrives at 9 AM if Daymark is open, otherwise the next time you open it.',
};

const STATUS_TEXT = {
  synced: 'Synced',
  device: 'On this device',
  locked: 'Enter your passcode to sync',
  unset: 'On this device. Set DAYMARK_PASSCODE in Vercel to sync.',
};

export default function HomePage() {
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState('inbox');
  const [title, setTitle] = useState('');
  const [sheet, setSheet] = useState(null);
  const [syncMode, setSyncMode] = useState('device');
  const [installEvent, setInstallEvent] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [undo, setUndo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [stepFor, setStepFor] = useState(null);
  const [stepTitle, setStepTitle] = useState('');
  const [naming, setNaming] = useState(false);
  const [listName, setListName] = useState('');
  const [dragOrder, setDragOrder] = useState(null);
  const [remindHint, setRemindHint] = useState('');
  const [pushState, setPushState] = useState('unknown');
  const [passInput, setPassInput] = useState('');
  const [passHint, setPassHint] = useState('');
  const stateRef = useRef(null);
  const undoTimer = useRef(null);
  const pushTimer = useRef(null);
  const pullRef = useRef(null);
  const pushInfo = useRef(null);
  const pushChecked = useRef(false);

  const listId = state?.lists.some((list) => list.id === selected) ? selected : 'inbox';

  function apply(next, { push = true } = {}) {
    const board = normalizeBoard(next);
    stateRef.current = board;
    setState(board);
    savePersisted(board);
    if (!push) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => send(board), 350);
  }

  async function send(board) {
    try {
      const res = await api('/api/board', { method: 'PUT', body: { board } });
      const data = await res.json();
      if (!data.synced || !data.board) {
        setSyncMode(modeFor(data.reason));
        return;
      }
      setSyncMode('synced');
      const merged = normalizeBoard(data.board);
      if (signature(merged) !== signature(stateRef.current)) apply(merged, { push: false });
    } catch {
      setSyncMode('device');
    }
  }

  function checkReminders() {
    const board = stateRef.current;
    if (!board || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const today = todayKey();
    const due = remindersDue(board, today);
    if (due.length === 0) return;
    notify(reminderMessage(due, today));
    let next = board;
    for (const task of due) next = updateTask(next, task.id, { remindedOn: task.dueAt });
    apply(next);
  }

  async function preparePush() {
    if (pushChecked.current) return;
    pushChecked.current = true;
    try {
      const res = await api('/api/push');
      pushInfo.current = await res.json();
    } catch {
      pushInfo.current = { enabled: false };
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') ensurePush();
    else if (!pushInfo.current.enabled) setPushState('off');
  }

  async function ensurePush() {
    const info = pushInfo.current;
    if (!info?.enabled) {
      setPushState('off');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unsupported');
      return;
    }
    try {
      const key = keyBytes(info.publicKey);
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await api('/api/push', {
        method: 'POST',
        body: { subscription: sub.toJSON(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      setPushState(res.ok ? 'on' : 'off');
    } catch {
      setPushState('off');
    }
  }

  useEffect(() => {
    const local = loadState();
    stateRef.current = local;
    setState(local);
    setSelected(loadSelectedList());

    const onPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    setShowIosHint(ios && !standalone);

    let cancel = false;
    async function pull() {
      try {
        const res = await api('/api/board');
        const data = await res.json();
        if (cancel) return 'device';
        if (!data.synced) {
          const mode = modeFor(data.reason);
          setSyncMode(mode);
          return mode;
        }
        setSyncMode('synced');
        preparePush();
        if (!data.board) {
          send(stateRef.current);
          return 'synced';
        }
        const merged = mergeBoards(stateRef.current, data.board);
        if (signature(merged) !== signature(stateRef.current)) apply(merged, { push: false });
        if (signature(merged) !== signature(normalizeBoard(data.board))) send(merged);
        return 'synced';
      } catch {
        if (!cancel) setSyncMode('device');
        return 'device';
      }
    }
    pullRef.current = pull;
    pull();
    const timer = setInterval(pull, 8000);
    const reminderTimer = setInterval(() => checkReminders(), 60 * 1000);
    window.addEventListener('focus', pull);
    return () => {
      cancel = true;
      clearInterval(timer);
      clearInterval(reminderTimer);
      window.removeEventListener('focus', pull);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  useEffect(() => {
    checkReminders();
  }, [state]);

  const sheetOpen = Boolean(sheet);
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setSheet(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  function chooseList(id) {
    setSelected(id);
    saveSelectedList(id);
  }

  function offerUndo(entry) {
    setUndo(entry);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function onAdd(event) {
    event.preventDefault();
    if (!state || !cleanTitle(title)) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setEditing(null);
    setRemindHint('');
    setSheet({ title, kind: 'none', date: '', remind: false, priority: 'none' });
  }

  function confirmSheet(event) {
    event.preventDefault();
    if (!sheet) return;
    const dueAt = resolveDue(sheet, todayKey());
    if (sheet.kind === 'pick' && !dueAt) return;
    const next = addTask(state, {
      listId,
      title: sheet.title,
      dueAt,
      remind: sheet.remind,
      priority: sheet.priority,
    });
    if (next === state) return;
    apply(next);
    setSheet(null);
    setTitle('');
  }

  function onCreateList(event) {
    event.preventDefault();
    const next = addList(state, listName);
    if (next === state) return;
    const created = next.lists.find((list) => list.name.toLowerCase() === listName.trim().toLowerCase());
    apply(next);
    if (created) chooseList(created.id);
    setListName('');
    setNaming(false);
  }

  function onDeleteList() {
    const result = deleteList(state, listId);
    if (!result.removed) return;
    apply(result.board);
    chooseList('inbox');
    offerUndo({ label: result.removed.list.name, listRemoval: result.removed });
  }

  function onDeleteTask(id) {
    const result = deleteTask(state, id);
    if (result.removed.length === 0) return;
    apply(result.board);
    if (editing === id) setEditing(null);
    offerUndo({ label: result.removed[0].title, tasks: result.removed });
  }

  function onUndo() {
    if (!undo || !state) return;
    const next = undo.tasks ? restoreTasks(state, undo.tasks) : restoreList(state, undo.listRemoval);
    apply(next);
    setUndo(null);
  }

  function startEdit(task) {
    setEditing(task.id);
    setDraft({
      title: task.title,
      ...dueChoice(task.dueAt, todayKey()),
      remind: Boolean(task.remind),
      priority: task.priority,
    });
    setRemindHint('');
  }

  async function allowReminders() {
    if (typeof Notification === 'undefined') {
      setRemindHint(
        /iphone|ipad|ipod/i.test(navigator.userAgent)
          ? 'On iPhone, add Daymark to your Home Screen first. Reminders work from there.'
          : 'This browser cannot show notifications.',
      );
      return false;
    }
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') {
      setRemindHint('');
      if (pushInfo.current?.enabled && pushState !== 'on') ensurePush();
      return true;
    }
    setRemindHint('Notifications are blocked for Daymark. Allow them in your browser settings to get reminders.');
    return false;
  }

  async function toggleRemind(on, set) {
    if (!on) {
      set(false);
      setRemindHint('');
      return;
    }
    if (await allowReminders()) set(true);
  }

  function saveEdit(event) {
    event.preventDefault();
    const dueAt = resolveDue(draft, todayKey());
    if (draft.kind === 'pick' && !dueAt) return;
    const next = updateTask(state, editing, {
      title: draft.title,
      dueAt,
      remind: draft.remind,
      priority: draft.priority,
    });
    if (next === state) return;
    apply(next);
    setEditing(null);
  }

  function onStep(event) {
    event.preventDefault();
    const next = addTask(state, { title: stepTitle, parentId: stepFor });
    if (next === state) return;
    apply(next);
    setStepTitle('');
    setStepFor(null);
  }

  function startDrag(event, task, siblings) {
    if (event.button != null && event.button !== 0) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const ids = siblings.map((item) => item.id);
    const from = ids.indexOf(task.id);
    const band = siblings.map((item, index) => (sameBand(item, task) ? index : -1)).filter((index) => index >= 0);
    const lo = band[0];
    const hi = band[band.length - 1];
    const startY = event.clientY;
    let latest = ids;

    function onMove(moveEvent) {
      const shift = Math.round((moveEvent.clientY - startY) / 64);
      const to = Math.max(lo, Math.min(hi, from + shift));
      const next = ids.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      latest = next;
      setDragOrder(next);
    }
    function onUp() {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      setDragOrder(null);
      if (latest.join() !== ids.join()) apply(reorderTasks(stateRef.current, latest));
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }

  async function onUnlock(event) {
    event.preventDefault();
    savePasscode(passInput.trim());
    setPassHint('');
    const mode = await pullRef.current?.();
    if (mode === 'locked') setPassHint("That passcode didn't match.");
    else setPassInput('');
  }

  async function onInstall() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  if (!state) return <main />;

  const today = todayKey();
  const currentList = state.lists.find((list) => list.id === listId);
  const groups = groupOpenTasks(state, listId, today);
  const done = doneTasks(state, listId);
  const openCount = state.tasks.filter((task) => task.listId === listId && !task.done).length;
  const remindDraft = (on) => toggleRemind(on, (value) => setDraft((current) => current && { ...current, remind: value }));
  const remindSheet = (on) => toggleRemind(on, (value) => setSheet((current) => current && { ...current, remind: value }));
  const remindNote = pushState === 'on' ? REMIND_NOTE.push : REMIND_NOTE.open;

  function show(tasks) {
    if (!dragOrder || !tasks.every((task) => dragOrder.includes(task.id))) return tasks;
    const rank = new Map(dragOrder.map((id, index) => [id, index]));
    return tasks.slice().sort((a, b) => rank.get(a.id) - rank.get(b.id));
  }

  return (
    <main className={undo ? 'has-undo' : undefined}>
      <header className="top">
        <div>
          <h1>Daymark</h1>
          <p className="lede">
            {openCount === 0 ? 'Nothing open' : `${openCount} open`}
            {groups.overdue.length > 0 ? ` · ${groups.overdue.length} overdue` : ''}
          </p>
        </div>
        {installEvent ? (
          <button type="button" className="install" onClick={onInstall}>
            Install
          </button>
        ) : null}
      </header>
      <p className={syncMode === 'synced' ? 'status up' : 'status'}>{STATUS_TEXT[syncMode]}</p>
      {syncMode === 'locked' ? (
        <form className="unlock" onSubmit={onUnlock}>
          <input
            type="password"
            value={passInput}
            onChange={(event) => setPassInput(event.target.value)}
            placeholder="Passcode"
            aria-label="Passcode"
            autoComplete="current-password"
          />
          <button type="submit">Unlock</button>
        </form>
      ) : null}
      {passHint ? <p className="hint tight">{passHint}</p> : null}

      <div className="lists">
        {state.lists.map((list) => (
          <button
            key={list.id}
            type="button"
            className={list.id === listId ? 'chip on' : 'chip'}
            onClick={() => chooseList(list.id)}
          >
            {list.name}
          </button>
        ))}
        {naming ? (
          <form className="chipform" onSubmit={onCreateList}>
            <input
              value={listName}
              onChange={(event) => setListName(event.target.value)}
              placeholder="List name"
              aria-label="List name"
              maxLength={40}
              autoFocus
            />
            <button type="submit">Add</button>
          </form>
        ) : (
          <button type="button" className="chip" onClick={() => setNaming(true)}>
            New list
          </button>
        )}
      </div>
      {listId !== 'inbox' ? (
        <button type="button" className="textbtn" onClick={onDeleteList}>
          Delete this list
        </button>
      ) : null}

      <form className="add" onSubmit={onAdd}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task"
          aria-label="Task"
          enterKeyHint="next"
          maxLength={200}
        />
        <button type="submit">Add</button>
      </form>

      {GROUPS.map(([key, label]) =>
        groups[key].length === 0 ? null : (
          <section key={key}>
            <h2>{label}</h2>
            <ul className="tasks">
              {show(groups[key]).map((task) => (
                <TaskBlock
                  key={task.id}
                  task={task}
                  today={today}
                  siblings={groups[key]}
                  state={state}
                  editing={editing}
                  draft={draft}
                  stepFor={stepFor}
                  stepTitle={stepTitle}
                  remindHint={remindHint}
                  remindNote={remindNote}
                  dragOrder={dragOrder}
                  onToggle={() => apply(setDone(state, task.id, !task.done))}
                  onDelete={() => onDeleteTask(task.id)}
                  onEdit={() => startEdit(task)}
                  onDraft={setDraft}
                  onRemind={remindDraft}
                  onSave={saveEdit}
                  onCancel={() => setEditing(null)}
                  onDrag={startDrag}
                  onStepStart={() => {
                    setStepFor(task.id);
                    setStepTitle('');
                  }}
                  onStepTitle={setStepTitle}
                  onStep={onStep}
                  onChildToggle={(id, doneFlag) => apply(setDone(state, id, doneFlag))}
                  onChildDelete={onDeleteTask}
                  onChildEdit={startEdit}
                />
              ))}
            </ul>
          </section>
        ),
      )}

      {done.length > 0 ? (
        <section>
          <h2>Done</h2>
          <ul className="tasks">
            {done.map((task) => (
              <TaskBlock
                key={task.id}
                task={task}
                today={today}
                siblings={done}
                state={state}
                done
                editing={editing}
                draft={draft}
                stepFor={stepFor}
                stepTitle={stepTitle}
                remindHint={remindHint}
                remindNote={remindNote}
                dragOrder={dragOrder}
                onToggle={() => apply(setDone(state, task.id, false))}
                onDelete={() => onDeleteTask(task.id)}
                onEdit={() => startEdit(task)}
                onDraft={setDraft}
                onRemind={remindDraft}
                onSave={saveEdit}
                onCancel={() => setEditing(null)}
                onDrag={startDrag}
                onStepStart={() => {}}
                onStepTitle={setStepTitle}
                onStep={onStep}
                onChildToggle={(id, doneFlag) => apply(setDone(state, id, doneFlag))}
                onChildDelete={onDeleteTask}
                onChildEdit={startEdit}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {undo ? (
        <div className="undo">
          <span>Deleted {undo.label}</span>
          <button type="button" onClick={onUndo}>
            Undo
          </button>
        </div>
      ) : null}

      {showIosHint ? <p className="hint">To install on iPhone, tap Share, then Add to Home Screen.</p> : null}

      {sheet ? (
        <AddSheet
          sheet={sheet}
          listName={currentList ? currentList.name : 'Inbox'}
          today={today}
          remindHint={remindHint}
          remindNote={remindNote}
          onChange={setSheet}
          onRemind={remindSheet}
          onCancel={() => setSheet(null)}
          onConfirm={confirmSheet}
        />
      ) : null}
    </main>
  );
}

function AddSheet({ sheet, listName, today, remindHint, remindNote, onChange, onRemind, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const dueAt = resolveDue(sheet, today);
  const blocked = !cleanTitle(sheet.title) || (sheet.kind === 'pick' && !dueAt);
  return (
    <div
      className="backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        onSubmit={onConfirm}
      >
        <p id="sheet-title" className="sheet-title">
          New task in {listName}
        </p>
        <input
          className="field"
          value={sheet.title}
          onChange={(event) => onChange({ ...sheet, title: event.target.value })}
          aria-label="Task"
          maxLength={200}
        />
        <p className="label">When is it due?</p>
        <DuePicker
          choice={sheet}
          min={today}
          onChange={(choice) => onChange({ ...sheet, ...choice, remind: choice.kind === 'none' ? false : sheet.remind })}
        />
        <RemindToggle on={sheet.remind} disabled={!dueAt} note={remindNote} onToggle={onRemind} />
        {remindHint ? <p className="hint tight">{remindHint}</p> : null}
        <p className="label">Priority</p>
        <PriorityPicker value={sheet.priority} onChange={(priority) => onChange({ ...sheet, priority })} />
        <div className="sheet-actions">
          <button type="button" className="textbtn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={blocked}>
            Add task
          </button>
        </div>
      </form>
    </div>
  );
}

function DuePicker({ choice, min, onChange }) {
  return (
    <div className="due">
      <div className="choices" role="group" aria-label="Due">
        {DUE_CHOICES.map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className={choice.kind === kind ? 'chip on' : 'chip'}
            aria-pressed={choice.kind === kind}
            onClick={() => onChange({ kind, date: choice.date })}
          >
            {label}
          </button>
        ))}
      </div>
      {choice.kind === 'pick' ? (
        <input
          type="date"
          className="field"
          value={choice.date}
          min={min}
          onChange={(event) => onChange({ kind: 'pick', date: event.target.value })}
          aria-label="Due date"
        />
      ) : null}
    </div>
  );
}

function PriorityPicker({ value, onChange }) {
  return (
    <div className="choices" role="group" aria-label="Priority">
      {PRIORITY_CHOICES.map(([level, label]) => (
        <button
          key={level}
          type="button"
          className={value === level ? 'chip on' : 'chip'}
          aria-pressed={value === level}
          onClick={() => onChange(level)}
        >
          {PRIORITY_MARK[level] ? (
            <span className={`pmark p-${level}`} aria-hidden="true">
              {PRIORITY_MARK[level]}
            </span>
          ) : null}
          {label}
        </button>
      ))}
    </div>
  );
}

function RemindToggle({ on, disabled, note, onToggle }) {
  const checked = Boolean(on) && !disabled;
  return (
    <div className="remindbox">
      <label className={disabled ? 'remind off' : 'remind'}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        Remind me
      </label>
      {disabled ? <p className="note">Choose a day to turn this on.</p> : null}
      {checked ? <p className="note">{note}</p> : null}
    </div>
  );
}

function TaskBlock(props) {
  const { task, state, done, today } = props;
  const steps = childrenOf(state, task.id);
  return (
    <li className="block">
      <TaskRow {...props} task={task} done={done || task.done} today={today} />
      {steps.length > 0 ? (
        <ul className="subs">
          {steps.map((step) => (
            <TaskRow
              key={step.id}
              {...props}
              task={step}
              done={step.done}
              today={today}
              siblings={steps}
              child
              onToggle={() => props.onChildToggle(step.id, !step.done)}
              onDelete={() => props.onChildDelete(step.id)}
              onEdit={() => props.onChildEdit(step)}
            />
          ))}
        </ul>
      ) : null}
      {!done && !task.done ? (
        props.stepFor === task.id ? (
          <form className="stepform" onSubmit={props.onStep}>
            <input
              value={props.stepTitle}
              onChange={(event) => props.onStepTitle(event.target.value)}
              placeholder="Add a step"
              aria-label={`Step for ${task.title}`}
              maxLength={200}
              autoFocus
            />
            <button type="submit">Add</button>
          </form>
        ) : (
          <button type="button" className="textbtn step" onClick={props.onStepStart}>
            Add a step
          </button>
        )
      ) : null}
    </li>
  );
}

function TaskRow({
  task,
  done,
  today,
  siblings,
  editing,
  draft,
  remindHint,
  remindNote,
  dragOrder,
  child,
  onToggle,
  onDelete,
  onEdit,
  onDraft,
  onRemind,
  onSave,
  onCancel,
  onDrag,
}) {
  const meta = rowMeta(task, today, done);
  const editingThis = editing === task.id && draft;
  const mark = done ? null : PRIORITY_MARK[task.priority];
  const spoken = mark ? `${task.title}, ${task.priority} priority` : task.title;
  return (
    <div className={dragOrder && dragOrder[0] === task.id ? 'row dragging' : 'row'}>
      <button
        type="button"
        className="handle"
        aria-label={`Reorder ${task.title}`}
        onPointerDown={(event) => onDrag(event, task, siblings)}
      >
        ⋮⋮
      </button>
      <button type="button" className={done ? 'check checked' : 'check'} onClick={onToggle} aria-label={spoken}>
        <span className="box" aria-hidden="true" />
      </button>
      <div className="body">
        {editingThis ? (
          <form className="edit" onSubmit={onSave}>
            <input
              className="field"
              value={draft.title}
              onChange={(event) => onDraft({ ...draft, title: event.target.value })}
              aria-label="Task title"
              maxLength={200}
            />
            {child ? null : (
              <>
                <DuePicker
                  choice={draft}
                  onChange={(choice) =>
                    onDraft({ ...draft, ...choice, remind: choice.kind === 'none' ? false : draft.remind })
                  }
                />
                <RemindToggle
                  on={draft.remind}
                  disabled={!resolveDue(draft, today)}
                  note={remindNote}
                  onToggle={onRemind}
                />
                <PriorityPicker value={draft.priority} onChange={(priority) => onDraft({ ...draft, priority })} />
              </>
            )}
            {remindHint ? <p className="hint tight">{remindHint}</p> : null}
            <div className="editactions">
              <button
                type="submit"
                disabled={!cleanTitle(draft.title) || (draft.kind === 'pick' && !resolveDue(draft, today))}
              >
                Save
              </button>
              <button type="button" className="textbtn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="titlebtn" onClick={onEdit}>
            <span className={done ? 'title checked-title' : 'title'}>
              {mark ? (
                <span className={`pmark p-${task.priority}`} aria-hidden="true">
                  {mark}
                </span>
              ) : null}
              {task.title}
            </span>
            {meta.text ? <span className={meta.late ? 'meta late' : 'meta'}>{meta.text}</span> : null}
          </button>
        )}
      </div>
      <button type="button" className="delete" aria-label={`Delete ${task.title}`} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function rowMeta(task, today, done) {
  if (done) return { text: '', late: false };
  const parts = [];
  if (task.dueAt && task.dueAt !== today) parts.push(shortDate(task.dueAt));
  if (task.remind) parts.push('Reminder on');
  return { text: parts.join(' · '), late: Boolean(task.dueAt) && task.dueAt < today };
}

function shortDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function signature(board) {
  return JSON.stringify({ lists: board.lists, tasks: board.tasks, tombstones: board.tombstones });
}

function notify({ title, body, tag }) {
  const options = { body, tag, icon: '/icons/icon-192.png' };
  const direct = () => {
    try {
      new Notification(title, options);
    } catch {}
  };
  if (!navigator.serviceWorker) {
    direct();
    return;
  }
  navigator.serviceWorker
    .getRegistration()
    .then((reg) => (reg ? reg.showNotification(title, options) : direct()))
    .catch(direct);
}

function api(path, { method = 'GET', body } = {}) {
  const headers = { 'x-daymark-passcode': encodeURIComponent(loadPasscode()) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(path, {
    method,
    headers,
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function modeFor(reason) {
  if (reason === 'locked' || reason === 'unset') return reason;
  return 'device';
}

function keyBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function sameKey(buffer, bytes) {
  if (!buffer) return false;
  const current = new Uint8Array(buffer);
  return current.length === bytes.length && current.every((value, index) => value === bytes[index]);
}
