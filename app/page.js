'use client';

import { useEffect, useRef, useState } from 'react';
import {
  activityDays,
  activityWeek,
  addEntry,
  addHabit,
  addList,
  addTask,
  checkHabit,
  childrenOf,
  cleanTitle,
  DEFAULT_REMIND_AT,
  dayActivity,
  defaultRemindAt,
  deleteEntry,
  deleteHabit,
  deleteList,
  deleteTask,
  doneTasks,
  dueChoice,
  groupOpenTasks,
  habitChecked,
  habitScheduled,
  habitStats,
  mergeBoards,
  normalizeBoard,
  reminderKey,
  reminderMessage,
  remindersDue,
  reorderTasks,
  resolveDue,
  restoreEntries,
  restoreHabit,
  restoreList,
  restoreTasks,
  sameBand,
  setDone,
  shiftDay,
  todayKey,
  todayPlan,
  updateHabit,
  updateTask,
  weekdayOf,
} from './lib/board';
import {
  clearPass,
  applyTheme,
  loadPass,
  loadTheme,
  loadSelectedList,
  loadState,
  savePass,
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

const STATUS_TEXT = {
  synced: 'Synced',
  device: 'On this device',
  locked: 'Enter your 4-digit passcode to sync',
  throttled: 'Too many wrong passcodes. Try again in 15 minutes.',
  unset: 'On this device. Set a 4-digit DAYMARK_PASSCODE in Vercel to sync.',
};

const POLL_MS = 15 * 1000;

export default function HomePage() {
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState('inbox');
  const [title, setTitle] = useState('');
  const [view, setView] = useState('tasks');
  const [logText, setLogText] = useState('');
  const [habitText, setHabitText] = useState('');
  const [habitSheet, setHabitSheet] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [syncMode, setSyncMode] = useState('device');
  const [installEvent, setInstallEvent] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [undo, setUndo] = useState(null);
  const [stepFor, setStepFor] = useState(null);
  const [stepTitle, setStepTitle] = useState('');
  const [naming, setNaming] = useState(false);
  const [listName, setListName] = useState('');
  const [dragOrder, setDragOrder] = useState(null);
  const [remindHint, setRemindHint] = useState('');
  const [pushState, setPushState] = useState('unknown');
  const [passInput, setPassInput] = useState('');
  const [passHint, setPassHint] = useState('');
  const [theme, setTheme] = useState('light');
  const stateRef = useRef(null);
  const undoTimer = useRef(null);
  const pushTimer = useRef(null);
  const pullRef = useRef(null);
  const pushInfo = useRef(null);
  const pushChecked = useRef(false);
  const throttledUntil = useRef(0);

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

  function lockedOut(reason) {
    let mode = modeFor(reason);
    if (mode === 'locked') {
      clearPass();
      if (throttledUntil.current > Date.now()) mode = 'throttled';
    }
    setSyncMode(mode);
    return mode;
  }

  async function send(board) {
    try {
      const res = await api('/api/board', { method: 'PUT', body: { board } });
      const data = await res.json();
      if (!data.synced || !data.board) {
        lockedOut(data.reason);
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
    const due = remindersDue(board, Date.now(), localZone());
    if (due.length === 0) return;
    notify(reminderMessage(due, today));
    let next = board;
    for (const task of due) next = updateTask(next, task.id, { remindedOn: reminderKey(task) });
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
        body: { subscription: sub.toJSON(), timeZone: localZone() },
      });
      setPushState(res.ok ? (info.exact ? 'exact' : 'daily') : 'off');
    } catch {
      setPushState('off');
    }
  }

  useEffect(() => {
    const saved = document.documentElement.dataset.theme === 'dark' ? 'dark' : loadTheme();
    setTheme(applyTheme(saved));
    const onStorage = (event) => {
      if (event.key !== 'daymark-theme') return;
      setTheme(applyTheme(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const local = loadState();
    stateRef.current = local;
    setState(local);
    setSelected(loadSelectedList());
    if (!loadPass()) clearPass();

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
        if (!data.synced) return lockedOut(data.reason);
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
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') pull();
    }, POLL_MS);
    const reminderTimer = setInterval(() => checkReminders(), 30 * 1000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      pull();
      checkReminders();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancel = true;
      clearInterval(timer);
      clearInterval(reminderTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  useEffect(() => {
    checkReminders();
  }, [state]);

  const sheetOpen = Boolean(sheet) || Boolean(habitSheet);
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setSheet(null);
      setHabitSheet(null);
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

  function openSheet(fields) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setRemindHint('');
    setSheet(fields);
  }

  function onAdd(event) {
    event.preventDefault();
    if (!state || !cleanTitle(title)) return;
    openSheet({
      editId: null,
      child: false,
      title,
      kind: 'none',
      date: '',
      remind: false,
      remindAt: DEFAULT_REMIND_AT,
      priority: 'none',
    });
  }

  function startEdit(task) {
    openSheet({
      editId: task.id,
      child: Boolean(task.parentId),
      title: task.title,
      ...dueChoice(task.dueAt, todayKey()),
      remind: Boolean(task.remind),
      remindAt: task.remindAt,
      priority: task.priority,
    });
  }

  function confirmSheet(event) {
    event.preventDefault();
    if (!sheet) return;
    const dueAt = resolveDue(sheet, todayKey());
    if (sheet.kind === 'pick' && !dueAt) return;
    const fields = {
      title: sheet.title,
      dueAt,
      remind: sheet.remind,
      remindAt: sheet.remindAt,
      remindTz: localZone(),
      priority: sheet.priority,
    };
    let next;
    if (!sheet.editId) next = addTask(state, { listId, ...fields });
    else next = updateTask(state, sheet.editId, sheet.child ? { title: sheet.title } : fields);
    if (next === state) return;
    apply(next);
    if (!sheet.editId) setTitle('');
    setSheet(null);
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
    offerUndo({ label: result.removed[0].title, tasks: result.removed });
  }

  function onUndo() {
    if (!undo || !state) return;
    let next;
    if (undo.tasks) next = restoreTasks(state, undo.tasks);
    else if (undo.entries) next = restoreEntries(state, undo.entries);
    else if (undo.habit) next = restoreHabit(state, undo.habit);
    else next = restoreList(state, undo.listRemoval);
    apply(next);
    setUndo(null);
  }

  function onLog(event) {
    event.preventDefault();
    const next = addEntry(state, logText);
    if (next === state) return;
    apply(next);
    setLogText('');
  }

  function onAddHabit(event) {
    event.preventDefault();
    const next = addHabit(state, habitText);
    if (next === state) return;
    apply(next);
    setHabitText('');
  }

  function onToggleHabit(habitId, day, done) {
    apply(checkHabit(state, habitId, day, done));
  }

  function openHabit(habit) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setHabitSheet({ id: habit.id, name: habit.name, days: habit.days });
  }

  function saveHabit(event) {
    event.preventDefault();
    if (!habitSheet) return;
    const next = updateHabit(state, habitSheet.id, { name: habitSheet.name, days: habitSheet.days });
    if (next === state) return;
    apply(next);
    setHabitSheet(null);
  }

  function onDeleteHabit() {
    const result = deleteHabit(state, habitSheet.id);
    if (!result.removed) return;
    apply(result.board);
    setHabitSheet(null);
    offerUndo({ label: result.removed.habit.name, habit: result.removed });
  }

  function onDeleteEntry(id) {
    const result = deleteEntry(state, id);
    if (result.removed.length === 0) return;
    apply(result.board);
    offerUndo({ label: result.removed[0].text, entries: result.removed });
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
      if (pushInfo.current?.enabled && pushState !== 'exact' && pushState !== 'daily') ensurePush();
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

  async function unlockWith(code) {
    setPassHint('');
    setPassInput('');
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code }),
      });
      const data = await res.json();
      if (!data.unlocked) {
        if (data.reason === 'throttled') throttledUntil.current = Date.now() + 15 * 60 * 1000;
        if (data.reason === 'locked') setPassHint("That passcode didn't match.");
        lockedOut(data.reason);
        return;
      }
      if (data.pass) savePass(data);
      throttledUntil.current = 0;
      await pullRef.current?.();
    } catch {
      setPassHint('Could not reach Daymark. Try again.');
    }
  }

  function onPassInput(value) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setPassInput(digits);
    if (digits.length === 4) unlockWith(digits);
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
  const planToday = todayPlan(state, today);
  const habitLeft = Math.max(0, planToday.scheduled - planToday.done);
  const listEmpty =
    groups.overdue.length === 0 &&
    groups.today.length === 0 &&
    groups.later.length === 0 &&
    groups.none.length === 0 &&
    done.length === 0;
  const remindSheet = (on) =>
    toggleRemind(on, (value) =>
      setSheet((current) =>
        current && {
          ...current,
          remind: value,
          remindAt: value ? defaultRemindAt(resolveDue(current, todayKey())) : current.remindAt,
        },
      ),
    );

  function show(tasks) {
    if (!dragOrder || !tasks.every((task) => dragOrder.includes(task.id))) return tasks;
    const rank = new Map(dragOrder.map((id, index) => [id, index]));
    return tasks.slice().sort((a, b) => rank.get(a.id) - rank.get(b.id));
  }

  return (
    <main className={undo ? 'has-undo' : undefined}>
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <rect width="32" height="32" rx="9" fill="currentColor" />
              <path
                d="M9 16.5l4.2 4.2L23 11"
                fill="none"
                stroke="var(--mark)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <h1>Daymark</h1>
            <p className="lede">
              {openCount === 0 ? 'Nothing open' : `${openCount} open`}
              {groups.overdue.length > 0 ? ` · ${groups.overdue.length} overdue` : ''}
            </p>
          </div>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="themebtn"
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
            onClick={() => setTheme(applyTheme(theme === 'dark' ? 'light' : 'dark'))}
          >
            <ThemeIcon dark={theme === 'dark'} />
          </button>
          {installEvent ? (
            <button type="button" className="install" onClick={onInstall}>
              Install
            </button>
          ) : null}
        </div>
      </header>
      <p className={syncMode === 'synced' ? 'status up' : 'status'}>{STATUS_TEXT[syncMode]}</p>
      {syncMode === 'locked' ? (
        <form
          className="unlock"
          onSubmit={(event) => {
            event.preventDefault();
            if (passInput.length === 4) unlockWith(passInput);
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={passInput}
            onChange={(event) => onPassInput(event.target.value)}
            placeholder="••••"
            aria-label="4-digit passcode"
            autoComplete="off"
          />
          <button type="submit" disabled={passInput.length !== 4}>
            Unlock
          </button>
        </form>
      ) : null}
      {passHint ? <p className="hint tight">{passHint}</p> : null}

      {view === 'activity' ? (
        <ActivityView
          board={state}
          today={today}
          logText={logText}
          onLogText={setLogText}
          onLog={onLog}
          onDeleteEntry={onDeleteEntry}
        />
      ) : view === 'habits' ? (
        <HabitsView
          board={state}
          today={today}
          habitText={habitText}
          onHabitText={setHabitText}
          onAddHabit={onAddHabit}
          onToggleHabit={onToggleHabit}
          onOpenHabit={openHabit}
          onFinishTask={(id) => apply(setDone(state, id, true))}
        />
      ) : (
        <>
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

      {listEmpty ? <p className="hint empty">Add a task, then pick when it is due.</p> : null}

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
                  stepFor={stepFor}
                  stepTitle={stepTitle}
                  dragOrder={dragOrder}
                  onToggle={() => apply(setDone(state, task.id, !task.done))}
                  onDelete={() => onDeleteTask(task.id)}
                  onEdit={() => startEdit(task)}
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
                stepFor={stepFor}
                stepTitle={stepTitle}
                dragOrder={dragOrder}
                onToggle={() => apply(setDone(state, task.id, false))}
                onDelete={() => onDeleteTask(task.id)}
                onEdit={() => startEdit(task)}
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
        </>
      )}

      <nav className="dock" role="tablist" aria-label="View">
        {[
          ['tasks', 'Tasks', openCount, groups.overdue.length > 0],
          ['habits', 'Habits', habitLeft, false],
          ['activity', 'Activity', 0, false],
        ].map(([key, label, badge, warn]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={view === key ? 'view on' : 'view'}
            onClick={() => setView(key)}
          >
            <TabIcon name={key} />
            <span>{label}</span>
            {badge > 0 ? <span className={warn ? 'badge warn' : 'badge'}>{badge > 99 ? '99+' : badge}</span> : null}
          </button>
        ))}
      </nav>

      {undo ? (
        <div className="undo">
          <span>Deleted {undo.label}</span>
          <button type="button" onClick={onUndo}>
            Undo
          </button>
        </div>
      ) : null}

      {showIosHint ? <p className="hint">To install on iPhone, tap Share, then Add to Home Screen.</p> : null}

      {habitSheet ? (
        <HabitSheet
          board={state}
          draft={habitSheet}
          today={today}
          onChange={setHabitSheet}
          onToggleDay={(day, done) => onToggleHabit(habitSheet.id, day, done)}
          onSave={saveHabit}
          onDelete={onDeleteHabit}
          onClose={() => setHabitSheet(null)}
        />
      ) : null}

      {sheet ? (
        <TaskSheet
          sheet={sheet}
          listName={currentList ? currentList.name : 'Inbox'}
          today={today}
          remindHint={remindHint}
          pushState={pushState}
          onChange={setSheet}
          onRemind={remindSheet}
          onCancel={() => setSheet(null)}
          onConfirm={confirmSheet}
        />
      ) : null}
    </main>
  );
}

const ENTRY_TAGS = { logged: 'Logged', added: 'Added', done: 'Done', habit: 'Habit' };

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function HabitsView({ board, today, habitText, onHabitText, onAddHabit, onToggleHabit, onOpenHabit, onFinishTask }) {
  const standing = standingFor(board, today);
  const plan = standing.plan;
  const week = Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 6));
  return (
    <>
      <form className="add" onSubmit={onAddHabit}>
        <input
          value={habitText}
          onChange={(event) => onHabitText(event.target.value)}
          placeholder="Add a habit, like Drink water"
          aria-label="Habit"
          enterKeyHint="done"
          maxLength={80}
        />
        <button type="submit">Add</button>
      </form>

      {standing.show ? <DayStanding standing={standing} /> : null}

      <section>
        <h2>Today</h2>
        {plan.habits.length === 0 ? (
          <p className="hint empty">
            Add the things you want to do each day. Check them off as you go, and each one keeps a streak.
          </p>
        ) : (
          <ul className="tasks">
            {plan.habits.map((habit) => (
              <HabitRow
                key={habit.id}
                board={board}
                habit={habit}
                today={today}
                week={week}
                onToggle={onToggleHabit}
                onOpen={onOpenHabit}
              />
            ))}
          </ul>
        )}
      </section>

      {plan.tasks.length > 0 ? (
        <section>
          <h2>Tasks still due</h2>
          <ul className="tasks">
            {plan.tasks.map((task) => (
              <li key={task.id} className="row">
                <button
                  type="button"
                  className="check"
                  onClick={() => onFinishTask(task.id)}
                  aria-label={`Finish ${task.title}`}
                >
                  <span className="box" aria-hidden="true" />
                </button>
                <div className="body stack">
                  <span className="title">
                    {PRIORITY_MARK[task.priority] ? (
                      <span className={`pmark p-${task.priority}`} aria-hidden="true">
                        {PRIORITY_MARK[task.priority]}
                      </span>
                    ) : null}
                    {task.title}
                  </span>
                  <span className={task.dueAt < today ? 'meta late' : 'meta'}>
                    {task.dueAt < today ? `Overdue since ${shortDate(task.dueAt)}` : 'Due today'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function HabitRow({ board, habit, today, week, onToggle, onOpen }) {
  const scheduled = habitScheduled(habit, today);
  const done = habitChecked(board, habit.id, today);
  const { current } = habitStats(board, habit, today);
  let meta = current > 0 ? `${current}-day streak` : 'No streak yet';
  if (!scheduled && !done) meta = 'Rest day';
  return (
    <li className="row">
      <button
        type="button"
        className={done ? 'check checked' : 'check'}
        aria-pressed={done}
        aria-label={`${habit.name} today`}
        onClick={() => onToggle(habit.id, today, !done)}
      >
        <span className="box round" aria-hidden="true" />
      </button>
      <button type="button" className="titlebtn body" onClick={() => onOpen(habit)}>
        <span className="title">{habit.name}</span>
        <span className={current > 0 && meta !== 'Rest day' ? 'meta streak' : 'meta'}>{meta}</span>
      </button>
      <div className="dots" aria-hidden="true">
        {week.map((day) => (
          <span key={day} className={`dot ${dayState(board, habit, day, today)}`} />
        ))}
      </div>
    </li>
  );
}

function dayState(board, habit, day, today) {
  if (habitChecked(board, habit.id, day)) return 'done';
  if (day > today) return 'future';
  if (!habitScheduled(habit, day) || day < todayKey(new Date(habit.createdAt))) return 'rest';
  return day === today ? 'open' : 'missed';
}

function HabitSheet({ board, draft, today, onChange, onToggleDay, onSave, onDelete, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const habit = (board.habits || []).find((item) => item.id === draft.id);
  if (!habit) return null;
  const stats = habitStats(board, habit, today);
  const start = shiftDay(today, -weekdayOf(today) - 28);
  const cells = Array.from({ length: 35 }, (_, index) => shiftDay(start, index));
  const blocked = !cleanTitle(draft.name) || draft.days.length === 0;
  const toggleWeekday = (weekday) => {
    const days = draft.days.includes(weekday)
      ? draft.days.filter((day) => day !== weekday)
      : [...draft.days, weekday].sort();
    onChange({ ...draft, days });
  };
  return (
    <div
      className="backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="habit-title"
        tabIndex={-1}
        onSubmit={onSave}
      >
        <p id="habit-title" className="sheet-title">
          Habit
        </p>
        <input
          className="field"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          aria-label="Habit name"
          maxLength={80}
        />
        <p className="label">Which days?</p>
        <div className="choices weekdays" role="group" aria-label="Days">
          {WEEKDAY_LETTERS.map((letter, weekday) => (
            <button
              key={weekday}
              type="button"
              className={draft.days.includes(weekday) ? 'chip on' : 'chip'}
              aria-pressed={draft.days.includes(weekday)}
              aria-label={weekdayName(weekday)}
              onClick={() => toggleWeekday(weekday)}
            >
              {letter}
            </button>
          ))}
        </div>
        <p className="stats">
          <span>
            <strong>{stats.current}</strong>
            <span>Day streak</span>
          </span>
          <span>
            <strong>{stats.best}</strong>
            <span>Best</span>
          </span>
          <span>
            <strong>{stats.rate === null ? '–' : `${Math.round(stats.rate * 100)}%`}</strong>
            <span>Last 30 days</span>
          </span>
        </p>
        <div className="cal" role="group" aria-label="Last five weeks">
          {WEEKDAY_LETTERS.map((letter, index) => (
            <span key={`head-${index}`} className="calhead" aria-hidden="true">
              {letter}
            </span>
          ))}
          {cells.map((day) => {
            const done = habitChecked(board, habit.id, day);
            return (
              <button
                key={day}
                type="button"
                className={`calday ${dayState(board, habit, day, today)}${day === today ? ' today' : ''}`}
                disabled={day > today}
                aria-pressed={done}
                aria-label={dayHeading(day, today)}
                onClick={() => onToggleDay(day, !done)}
              >
                {Number(day.slice(8))}
              </button>
            );
          })}
        </div>
        <p className="note">Tap a day to mark it done or not done.</p>
        <div className="sheet-actions spread">
          <button type="button" className="textbtn danger" onClick={onDelete}>
            Delete habit
          </button>
          <span className="sheet-actions">
            <button type="button" className="textbtn" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="primary" disabled={blocked}>
              Save
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}

function weekdayName(weekday) {
  return new Date(2026, 0, 4 + weekday).toLocaleDateString(undefined, { weekday: 'long' });
}

function ActivityView({ board, today, logText, onLogText, onLog, onDeleteEntry }) {
  const week = activityWeek(board, today);
  const days = activityDays(board).slice(0, 30);
  const standing = standingFor(board, today);
  const finished = week.reduce((sum, day) => sum + day.onTime + day.late, 0);
  const onTime = week.reduce((sum, day) => sum + day.onTime, 0);
  const logged = week.reduce((sum, day) => sum + day.logged, 0);
  const habits = week.reduce((sum, day) => sum + day.habits, 0);
  const quiet = week.every((day) => day.onTime + day.late + day.habits + day.logged === 0);
  return (
    <>
      <form className="add" onSubmit={onLog}>
        <input
          value={logText}
          onChange={(event) => onLogText(event.target.value)}
          placeholder="Log something you did"
          aria-label="Activity"
          enterKeyHint="done"
          maxLength={200}
        />
        <button type="submit">Log</button>
      </form>

      <section className="panel">
        <h2>Today</h2>
        <DayStanding standing={standing} />
        <h2 className="again">Last 7 days</h2>
        <WeekChart week={week} today={today} />
        <div className="legend">
          <span>
            <i className="key ontime" />
            On time
          </span>
          <span>
            <i className="key late" />
            Late
          </span>
          <span>
            <i className="key habit" />
            Habits
          </span>
          <span>
            <i className="key logged" />
            Logged
          </span>
        </div>
        <dl className="meters">
          <div>
            <dt>Finished</dt>
            <dd>{finished}</dd>
          </div>
          <div>
            <dt>On time</dt>
            <dd>{finished ? `${Math.round((onTime * 100) / finished)}%` : '—'}</dd>
          </div>
          <div>
            <dt>Habits</dt>
            <dd>{habits}</dd>
          </div>
          <div>
            <dt>Logged</dt>
            <dd>{logged}</dd>
          </div>
        </dl>
        {quiet ? (
          <p className="note">The last 7 days fill in as you check habits, finish tasks, and log what you did.</p>
        ) : null}
      </section>

      {days.length === 0 ? (
        <p className="hint empty">Log what you did, or finish a task, and it shows up here.</p>
      ) : null}
      {days.map((day) => (
        <section key={day}>
          <h2>{dayHeading(day, today)}</h2>
          <ul className="timeline">
            {dayActivity(board, day).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="logrow">
                <span className={`mark ${item.kind}${item.late ? ' late' : ''}`} aria-hidden="true" />
                <span className="logtext">
                  <span className="logmain">
                    <span className={`tag ${item.kind}`}>{ENTRY_TAGS[item.kind]}</span>
                    {item.text}
                  </span>
                  {item.kind === 'done' ? (
                    <span className={item.late ? 'when late' : 'when ok'}>
                      {item.late ? `${item.late} ${item.late === 1 ? 'day' : 'days'} late` : 'On time'}
                    </span>
                  ) : null}
                </span>
                <span className="logend">
                  <span className="logtime">{todayKey(new Date(item.at)) === day ? timeOf(item.at) : ''}</span>
                  {item.kind === 'logged' ? (
                    <button
                      type="button"
                      className="rowbtn"
                      aria-label={`Delete ${item.text}`}
                      onClick={() => onDeleteEntry(item.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function WeekChart({ week, today }) {
  const totals = week.map((day) => day.onTime + day.late + day.habits + day.logged);
  const raw = Math.max(0, ...totals);
  const top = scaleTop(Math.max(1, raw));
  const plot = 132;
  const height = (count) => (count > 0 ? Math.max(6, Math.round((count / top) * plot)) : 0);
  const ticks = raw === 0 ? [0] : ticksFor(top);
  const label = week
    .map(
      (day) =>
        `${weekday(day.day)} ${Number(day.day.slice(8))}: ${day.onTime} on time, ${day.late} late, ${day.habits} habits, ${day.logged} logged`,
    )
    .join('; ');
  return (
    <div className="chart" role="img" aria-label={label} style={{ '--plot': `${plot}px` }}>
      <div className="plot">
        <div className={ticks.length === 1 ? 'grid solo' : 'grid'} aria-hidden="true">
          {ticks.map((tick) => (
            <div key={tick} className={tick === 0 ? 'gridline axis' : 'gridline'}>
              <span>{tick}</span>
            </div>
          ))}
        </div>
        <div className="cols">
          {week.map((day, index) => {
            const parts = [
              ['logged', day.logged],
              ['habit', day.habits],
              ['late', day.late],
              ['ontime', day.onTime],
            ].filter(([, count]) => count > 0);
            return (
              <div key={day.day} className={day.day === today ? 'col today' : 'col'}>
                <span className="count">{totals[index] || ''}</span>
                <div className="bars">
                  <div className="bar stack" style={{ height: height(totals[index]) }}>
                    {parts.map(([kind, count]) => (
                      <span key={kind} className={`seg ${kind}`} style={{ flexGrow: count }} />
                    ))}
                  </div>
                </div>
                <span className="daylabel">
                  <span className="dow">{weekday(day.day, 'narrow')}</span>
                  <span className="dom">{Number(day.day.slice(8))}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function scaleTop(max) {
  if (max <= 4) return max;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function ticksFor(top) {
  if (top <= 1) return [1, 0];
  if (top <= 4) return Array.from({ length: top + 1 }, (_, index) => top - index);
  const mid = top / 2;
  return Number.isInteger(mid) ? [top, mid, 0] : [top, 0];
}

function standingFor(board, today) {
  const plan = todayPlan(board, today);
  const todayRow = activityWeek(board, today).find((day) => day.day === today);
  const tasksDone = todayRow ? todayRow.onTime + todayRow.late : 0;
  const tasksOpen = plan.tasks.length;
  let habitsCaption = 'No habits yet';
  if (plan.habits.length > 0) habitsCaption = plan.scheduled ? `${plan.done} of ${plan.scheduled}` : 'Rest day';
  const taskMax = tasksDone + tasksOpen;
  let tasksCaption = 'None due';
  if (taskMax > 0) tasksCaption = `${tasksDone} done${tasksOpen ? ` · ${tasksOpen} left` : ''}`;
  return {
    plan,
    show: plan.habits.length > 0 || tasksOpen > 0 || tasksDone > 0,
    habitsDone: plan.done,
    habitsTotal: plan.scheduled,
    habitsCaption,
    tasksDone,
    tasksOpen,
    tasksCaption,
  };
}

function DayStanding({ standing }) {
  return (
    <div className="daybars">
      <ProgressBar
        label="Habits"
        tone="habit"
        value={standing.habitsDone}
        max={standing.habitsTotal}
        caption={standing.habitsCaption}
      />
      <ProgressBar
        label="Tasks"
        tone="work"
        value={standing.tasksDone}
        max={standing.tasksDone + standing.tasksOpen}
        caption={standing.tasksCaption}
      />
    </div>
  );
}

function ProgressBar({ label, tone, value, max, caption }) {
  const pct = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  const width = pct > 0 ? Math.max(pct, 6) : 0;
  const meter =
    max > 0
      ? {
          role: 'meter',
          'aria-valuemin': 0,
          'aria-valuemax': max,
          'aria-valuenow': Math.min(value, max),
          'aria-label': `${label}, ${caption}`,
        }
      : { 'aria-label': `${label}, ${caption}` };
  return (
    <div className="progress">
      <div className="progress-top">
        <span>{label}</span>
        <strong>{caption}</strong>
      </div>
      <div className={`track ${tone}`} {...meter}>
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ThemeIcon({ dark }) {
  const pen = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (dark) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" {...pen} />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" {...pen} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" {...pen} />
    </svg>
  );
}

function TabIcon({ name }) {
  const pen = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'habits') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" {...pen} />
        <path d="M8.5 12.2l2.2 2.2 4.8-5" {...pen} />
      </svg>
    );
  }
  if (name === 'activity') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19V10M10 19V5M16 19v-6M20 19H3" {...pen} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" {...pen} />
      <path d="M8 12.2l2.4 2.4L16.2 9" {...pen} />
    </svg>
  );
}

function weekday(key, width = 'short') {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: width });
}

function dayHeading(day, today) {
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function TaskSheet({ sheet, listName, today, remindHint, pushState, onChange, onRemind, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const dueAt = resolveDue(sheet, today);
  const blocked = !cleanTitle(sheet.title) || (sheet.kind === 'pick' && !dueAt);
  let heading = `New task in ${listName}`;
  if (sheet.editId) heading = sheet.child ? 'Edit step' : 'Edit task';
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
          {heading}
        </p>
        <input
          className="field"
          value={sheet.title}
          onChange={(event) => onChange({ ...sheet, title: event.target.value })}
          aria-label={sheet.child ? 'Step' : 'Task'}
          maxLength={200}
        />
        {sheet.child ? null : (
          <>
            <p className="label">When is it due?</p>
            <DuePicker
              choice={sheet}
              min={sheet.editId ? undefined : today}
              onChange={(choice) =>
                onChange({ ...sheet, ...choice, remind: choice.kind === 'none' ? false : sheet.remind })
              }
            />
            <RemindToggle
              on={sheet.remind}
              disabled={!dueAt}
              time={sheet.remindAt}
              pushState={pushState}
              onToggle={onRemind}
              onTime={(remindAt) => onChange({ ...sheet, remindAt })}
            />
            {remindHint ? <p className="hint tight">{remindHint}</p> : null}
            <p className="label">Priority</p>
            <PriorityPicker value={sheet.priority} onChange={(priority) => onChange({ ...sheet, priority })} />
          </>
        )}
        <div className="sheet-actions">
          <button type="button" className="textbtn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={blocked}>
            {sheet.editId ? 'Save' : 'Add task'}
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

function RemindToggle({ on, disabled, time, pushState, onToggle, onTime }) {
  const checked = Boolean(on) && !disabled;
  return (
    <div className="remindbox">
      <div className="remindrow">
        <label className={disabled ? 'remind off' : 'remind'}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onToggle(event.target.checked)}
          />
          Remind me
        </label>
        {checked ? (
          <input
            type="time"
            className="field timefield"
            value={time}
            onChange={(event) => {
              if (event.target.value) onTime(event.target.value);
            }}
            aria-label="Reminder time"
          />
        ) : null}
      </div>
      {disabled ? <p className="note">Choose a day to turn this on.</p> : null}
      {checked ? <p className="note">{reminderNote(pushState, time)}</p> : null}
    </div>
  );
}

function reminderNote(pushState, time) {
  const at = clockLabel(time);
  if (pushState === 'exact') return `Arrives at ${at}, even when Daymark is closed.`;
  if (pushState === 'daily') {
    return `Arrives at ${at} while Daymark is open. When it is closed, it comes in the reminder around 9 AM.`;
  }
  return `Arrives at ${at} if Daymark is open, otherwise the next time you open it.`;
}

function clockLabel(time) {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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

function TaskRow({ task, done, today, siblings, dragOrder, onToggle, onDelete, onEdit, onDrag }) {
  const meta = rowMeta(task, today, done);
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
      </div>
      <button type="button" className="rowbtn" aria-label={`Edit ${task.title}`} onClick={onEdit}>
        Edit
      </button>
      <button type="button" className="rowbtn" aria-label={`Delete ${task.title}`} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function rowMeta(task, today, done) {
  if (done) return { text: '', late: false };
  const parts = [];
  if (task.dueAt && task.dueAt !== today) parts.push(shortDate(task.dueAt));
  if (task.remind) parts.push(`Reminder ${clockLabel(task.remindAt)}`);
  return { text: parts.join(' · '), late: Boolean(task.dueAt) && task.dueAt < today };
}

function shortDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function signature(board) {
  return JSON.stringify({
    lists: board.lists,
    tasks: board.tasks,
    entries: board.entries,
    habits: board.habits,
    checks: board.checks,
    tombstones: board.tombstones,
  });
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

function localZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function api(path, { method = 'GET', body } = {}) {
  const headers = {
    'x-daymark-session': loadPass()?.pass || '',
    'x-daymark-zone': localZone(),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(path, {
    method,
    headers,
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function modeFor(reason) {
  if (reason === 'locked' || reason === 'unset' || reason === 'throttled') return reason;
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
