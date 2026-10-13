'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addList,
  addTask,
  childrenOf,
  deleteList,
  deleteTask,
  doneTasks,
  dueLabel,
  groupOpenTasks,
  mergeBoards,
  normalizeBoard,
  reorderTasks,
  restoreList,
  restoreTasks,
  setDone,
  todayKey,
  updateTask,
} from './lib/board';
import { loadSelectedList, loadState, savePersisted, saveSelectedList } from './lib/storage';

const GROUPS = [
  ['overdue', 'Overdue'],
  ['today', 'Today'],
  ['later', 'Later'],
  ['none', 'No date'],
];

export default function HomePage() {
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState('inbox');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
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
  const [remindHint, setRemindHint] = useState(false);
  const stateRef = useRef(null);
  const undoTimer = useRef(null);
  const pushTimer = useRef(null);

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
      const res = await fetch('/api/board', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board }),
      });
      const data = await res.json();
      if (!data.synced || !data.board) {
        setSyncMode('device');
        return;
      }
      setSyncMode('synced');
      const merged = normalizeBoard(data.board);
      if (signature(merged) !== signature(stateRef.current)) apply(merged, { push: false });
    } catch {
      setSyncMode('device');
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
        const res = await fetch('/api/board', { cache: 'no-store' });
        const data = await res.json();
        if (cancel) return;
        if (!data.synced) {
          setSyncMode('device');
          return;
        }
        setSyncMode('synced');
        if (!data.board) {
          send(stateRef.current);
          return;
        }
        const merged = mergeBoards(stateRef.current, data.board);
        if (signature(merged) !== signature(stateRef.current)) apply(merged, { push: false });
        if (signature(merged) !== signature(normalizeBoard(data.board))) send(merged);
      } catch {
        if (!cancel) setSyncMode('device');
      }
    }
    pull();
    const timer = setInterval(pull, 8000);
    window.addEventListener('focus', pull);
    return () => {
      cancel = true;
      clearInterval(timer);
      window.removeEventListener('focus', pull);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  useEffect(() => {
    if (!state || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const today = todayKey();
    const hour = new Date().getHours();
    const dueTasks = state.tasks.filter((task) => {
      if (!task.remind || task.done || !task.dueAt || task.remindedOn === task.dueAt) return false;
      if (task.dueAt < today) return true;
      return task.dueAt === today && hour >= 9;
    });
    if (dueTasks.length === 0) return;
    for (const task of dueTasks) {
      const body = task.dueAt < today ? `${task.title} is overdue` : `${task.title} is due today`;
      notify(body, task.id);
    }
    let next = state;
    for (const task of dueTasks) next = updateTask(next, task.id, { remindedOn: task.dueAt });
    apply(next);
  }, [state]);

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
    if (!state) return;
    const next = addTask(state, { listId, title, dueAt: due || null });
    if (next === state) return;
    apply(next);
    setTitle('');
    setDue('');
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
    setDraft({ title: task.title, dueAt: task.dueAt || '', remind: Boolean(task.remind) });
    setRemindHint(false);
  }

  async function onRemindChange(checked) {
    if (checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        setRemindHint(true);
        setDraft((current) => ({ ...current, remind: false }));
        return;
      }
    }
    if (checked && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setRemindHint(true);
      return;
    }
    setDraft((current) => ({ ...current, remind: checked }));
  }

  function saveEdit(event) {
    event.preventDefault();
    const next = updateTask(state, editing, {
      title: draft.title,
      dueAt: draft.dueAt || null,
      remind: draft.remind,
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
    const startY = event.clientY;
    let latest = ids;

    function onMove(moveEvent) {
      const shift = Math.round((moveEvent.clientY - startY) / 64);
      const to = Math.max(0, Math.min(ids.length - 1, from + shift));
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

  async function onInstall() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  if (!state) return <main />;

  const listId = state.lists.some((list) => list.id === selected) ? selected : 'inbox';
  const today = todayKey();
  const groups = groupOpenTasks(state, listId, today);
  const done = doneTasks(state, listId);
  const openCount = state.tasks.filter((task) => task.listId === listId && !task.done).length;

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
      <p className={syncMode === 'synced' ? 'status up' : 'status'}>
        {syncMode === 'synced' ? 'Synced' : 'On this device'}
      </p>

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
          enterKeyHint="done"
          maxLength={200}
        />
        <input type="date" value={due} onChange={(event) => setDue(event.target.value)} aria-label="Due date" />
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
                  dragOrder={dragOrder}
                  onToggle={() => apply(setDone(state, task.id, !task.done))}
                  onDelete={() => onDeleteTask(task.id)}
                  onEdit={() => startEdit(task)}
                  onDraft={setDraft}
                  onRemind={onRemindChange}
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
                dragOrder={dragOrder}
                onToggle={() => apply(setDone(state, task.id, false))}
                onDelete={() => onDeleteTask(task.id)}
                onEdit={() => startEdit(task)}
                onDraft={setDraft}
                onRemind={onRemindChange}
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
    </main>
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
  const label = prettyDue(task.dueAt, today);
  const editingThis = editing === task.id;
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
      <button type="button" className={done ? 'check checked' : 'check'} onClick={onToggle} aria-label={task.title}>
        <span className="box" aria-hidden="true" />
      </button>
      <div className="body">
        {editingThis ? (
          <form className="edit" onSubmit={onSave}>
            <input
              value={draft.title}
              onChange={(event) => onDraft({ ...draft, title: event.target.value })}
              aria-label="Task title"
              maxLength={200}
            />
            {child ? null : (
              <input
                type="date"
                value={draft.dueAt}
                onChange={(event) => onDraft({ ...draft, dueAt: event.target.value })}
                aria-label="Due date"
              />
            )}
            {child ? null : (
              <label className="remind">
                <input
                  type="checkbox"
                  checked={Boolean(draft.remind) && Boolean(draft.dueAt)}
                  disabled={!draft.dueAt}
                  onChange={(event) => onRemind(event.target.checked)}
                />
                Remind me
              </label>
            )}
            {remindHint ? <p className="hint tight">Allow notifications to remind you.</p> : null}
            <div className="editactions">
              <button type="submit">Save</button>
              <button type="button" className="textbtn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="titlebtn" onClick={onEdit}>
            <span className={done ? 'title checked-title' : 'title'}>{task.title}</span>
            {label ? <span className={label === 'Overdue' ? 'meta late' : 'meta'}>{label}{task.remind ? ' · Remind' : ''}</span> : null}
          </button>
        )}
      </div>
      <button type="button" className="delete" aria-label={`Delete ${task.title}`} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function prettyDue(dueAt, today) {
  const label = dueLabel(dueAt, today);
  if (!label || label !== dueAt) return label;
  const [year, month, day] = dueAt.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function signature(board) {
  return JSON.stringify({ lists: board.lists, tasks: board.tasks, tombstones: board.tombstones });
}

function notify(body, tag) {
  const show = (reg) => {
    if (reg) reg.showNotification('Daymark', { body, tag });
    else new Notification('Daymark', { body, tag });
  };
  if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(show).catch(() => {});
  else show(null);
}
