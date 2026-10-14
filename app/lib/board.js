/** Checklist rules shared by the page and the tests. No browser, no database. */

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function cleanTitle(value, max = 200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.slice(0, max);
}

export function cleanDue(value) {
  if (value == null || value === '') return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

export const PRIORITIES = ['none', 'low', 'medium', 'high'];

const PRIORITY_RANK = { none: 0, low: 1, medium: 2, high: 3 };

export function cleanPriority(value) {
  return PRIORITIES.includes(value) ? value : 'none';
}

export const DEFAULT_REMIND_AT = '09:00';

export function cleanTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

export function validZone(value) {
  if (typeof value !== 'string' || !value || value.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function sentKey(task) {
  if (!task.remindedOn) return null;
  const at = cleanTime(task.remindAt) || DEFAULT_REMIND_AT;
  return task.remindedOn === task.dueAt ? `${task.dueAt} ${at}` : String(task.remindedOn);
}

export function emptyBoard() {
  return {
    lists: [{ id: 'inbox', name: 'Inbox', createdAt: new Date().toISOString(), updatedAt: new Date(0).toISOString() }],
    tasks: [],
    entries: [],
    habits: [],
    checks: [],
    tombstones: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function cleanDays(value) {
  const days = Array.isArray(value)
    ? [...new Set(value.map(Number))].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort()
    : [];
  return days.length > 0 ? days : ALL_DAYS.slice();
}

function checkId(habitId, day) {
  return `${habitId}:${day}`;
}

export function normalizeBoard(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const lists = Array.isArray(base.lists) ? base.lists : [];
  const cleanLists = lists
    .filter((list) => list && list.id && cleanTitle(list.name, 40))
    .map((list) => ({
      id: String(list.id),
      name: cleanTitle(list.name, 40),
      createdAt: list.createdAt || new Date().toISOString(),
      updatedAt: list.updatedAt || list.createdAt || new Date(0).toISOString(),
    }));
  if (!cleanLists.some((list) => list.id === 'inbox')) {
    cleanLists.unshift({ id: 'inbox', name: 'Inbox', createdAt: new Date().toISOString() });
  }

  const tasks = (Array.isArray(base.tasks) ? base.tasks : [])
    .filter((task) => task && task.id && cleanTitle(task.title))
    .map((task, index) => ({
      id: String(task.id),
      listId: cleanLists.some((list) => list.id === task.listId) ? task.listId : 'inbox',
      parentId: task.parentId ? String(task.parentId) : null,
      title: cleanTitle(task.title),
      done: Boolean(task.done),
      dueAt: cleanDue(task.dueAt),
      priority: cleanPriority(task.priority),
      remind: Boolean(task.remind) && Boolean(cleanDue(task.dueAt)),
      remindAt: cleanTime(task.remindAt) || DEFAULT_REMIND_AT,
      remindTz: validZone(task.remindTz),
      remindedOn: sentKey(task),
      position: Number.isFinite(task.position) ? task.position : index,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || task.createdAt || new Date(0).toISOString(),
      completedAt: task.completedAt || null,
    }));

  const entries = (Array.isArray(base.entries) ? base.entries : [])
    .filter((entry) => entry && entry.id && cleanTitle(entry.text) && !Number.isNaN(Date.parse(entry.at)))
    .map((entry) => ({
      id: String(entry.id),
      text: cleanTitle(entry.text),
      at: new Date(entry.at).toISOString(),
      createdAt: entry.createdAt || entry.at,
      updatedAt: entry.updatedAt || entry.createdAt || entry.at,
    }));

  const habits = (Array.isArray(base.habits) ? base.habits : [])
    .filter((habit) => habit && habit.id && cleanTitle(habit.name, 80))
    .map((habit, index) => ({
      id: String(habit.id),
      name: cleanTitle(habit.name, 80),
      days: cleanDays(habit.days),
      position: Number.isFinite(habit.position) ? habit.position : index,
      createdAt: habit.createdAt || new Date().toISOString(),
      updatedAt: habit.updatedAt || habit.createdAt || new Date(0).toISOString(),
    }));

  const checks = (Array.isArray(base.checks) ? base.checks : [])
    .filter((check) => check && check.habitId && cleanDue(check.day) && !Number.isNaN(Date.parse(check.at)))
    .map((check) => ({
      id: checkId(String(check.habitId), cleanDue(check.day)),
      habitId: String(check.habitId),
      day: cleanDue(check.day),
      at: new Date(check.at).toISOString(),
      createdAt: check.createdAt || check.at,
      updatedAt: check.updatedAt || check.createdAt || check.at,
    }));

  const tombstones = (Array.isArray(base.tombstones) ? base.tombstones : [])
    .filter((item) => item && item.id && item.deletedAt)
    .map((item) => ({ id: String(item.id), deletedAt: String(item.deletedAt) }));

  return {
    lists: cleanLists,
    tasks,
    entries,
    habits,
    checks,
    tombstones,
    updatedAt: base.updatedAt || new Date(0).toISOString(),
  };
}

function touch(board) {
  return { ...board, updatedAt: new Date().toISOString() };
}

function stamp() {
  return new Date().toISOString();
}

function recordTime(record) {
  return record.updatedAt || record.createdAt || '';
}

function bury(tombstones, ids) {
  const deletedAt = stamp();
  const gone = new Set(ids);
  return [
    ...(tombstones || []).filter((item) => !gone.has(item.id)),
    ...[...gone].map((id) => ({ id, deletedAt })),
  ];
}

function nextPosition(tasks, listId, parentId) {
  const siblings = tasks.filter(
    (task) => task.listId === listId && (task.parentId || null) === (parentId || null),
  );
  return siblings.reduce((max, task) => Math.max(max, task.position), -1) + 1;
}

export function addList(board, name) {
  const title = cleanTitle(name, 40);
  if (!title) return board;
  if (board.lists.some((list) => list.name.toLowerCase() === title.toLowerCase())) return board;
  const createdAt = stamp();
  return touch({
    ...board,
    lists: [...board.lists, { id: crypto.randomUUID(), name: title, createdAt, updatedAt: createdAt }],
  });
}

export function deleteList(board, id) {
  if (id === 'inbox' || board.lists.length < 2) return { board, removed: null };
  const list = board.lists.find((item) => item.id === id);
  if (!list) return { board, removed: null };
  const removedTasks = board.tasks.filter((task) => task.listId === id);
  const ids = [id, ...removedTasks.map((task) => task.id)];
  return {
    board: touch({
      ...board,
      lists: board.lists.filter((item) => item.id !== id),
      tasks: board.tasks.filter((task) => task.listId !== id),
      tombstones: bury(board.tombstones, ids),
    }),
    removed: { list, tasks: removedTasks },
  };
}

export function restoreList(board, removed) {
  if (!removed?.list) return board;
  const lists = board.lists.some((list) => list.id === removed.list.id)
    ? board.lists
    : [...board.lists, removed.list];
  const ids = new Set(board.tasks.map((task) => task.id));
  const revived = stamp();
  const tasks = [
    ...board.tasks,
    ...removed.tasks
      .filter((task) => !ids.has(task.id))
      .map((task) => ({ ...task, updatedAt: revived })),
  ];
  const gone = new Set([removed.list.id, ...removed.tasks.map((task) => task.id)]);
  return touch({
    ...board,
    lists: lists.map((list) => (list.id === removed.list.id ? { ...list, updatedAt: revived } : list)),
    tasks,
    tombstones: (board.tombstones || []).filter((item) => !gone.has(item.id)),
  });
}

export function addTask(
  board,
  {
    listId = 'inbox',
    title,
    dueAt = null,
    parentId = null,
    remind = false,
    remindAt = DEFAULT_REMIND_AT,
    remindTz = null,
    priority = 'none',
  } = {},
) {
  const text = cleanTitle(title);
  if (!text) return board;
  let parent = parentId || null;
  if (parent) {
    const host = board.tasks.find((task) => task.id === parent);
    if (!host || host.parentId) return board;
    parent = host.id;
  }
  const host = parent ? board.tasks.find((task) => task.id === parent) : null;
  const list = host ? host.listId : board.lists.some((item) => item.id === listId) ? listId : 'inbox';
  const due = cleanDue(dueAt);
  const createdAt = stamp();
  const task = {
    id: crypto.randomUUID(),
    listId: list,
    parentId: parent,
    title: text,
    done: false,
    dueAt: due,
    priority: parent ? 'none' : cleanPriority(priority),
    remind: Boolean(remind) && Boolean(due),
    remindAt: cleanTime(remindAt) || DEFAULT_REMIND_AT,
    remindTz: validZone(remindTz),
    remindedOn: null,
    position: nextPosition(board.tasks, list, parent),
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  };
  return touch({ ...board, tasks: [...board.tasks, task] });
}

export function updateTask(board, id, patch) {
  const due = patch.dueAt === undefined ? undefined : cleanDue(patch.dueAt);
  const title = patch.title === undefined ? undefined : cleanTitle(patch.title);
  if (patch.title !== undefined && !title) return board;
  return touch({
    ...board,
    tasks: board.tasks.map((task) => {
      if (task.id !== id) return task;
      const nextDue = due === undefined ? task.dueAt : due;
      const nextRemind = patch.remind === undefined ? task.remind : Boolean(patch.remind);
      return {
        ...task,
        title: title === undefined ? task.title : title,
        dueAt: nextDue,
        priority: patch.priority === undefined ? task.priority : cleanPriority(patch.priority),
        remind: nextRemind && Boolean(nextDue),
        remindAt: cleanTime(patch.remindAt) || task.remindAt,
        remindTz: patch.remindTz === undefined ? task.remindTz : validZone(patch.remindTz),
        remindedOn: patch.remindedOn === undefined ? task.remindedOn : patch.remindedOn,
        updatedAt: stamp(),
      };
    }),
  });
}

export function setDone(board, id, done) {
  const ids = descendantIds(board.tasks, id);
  if (!done) {
    let parent = board.tasks.find((task) => task.id === id)?.parentId;
    while (parent) {
      ids.add(parent);
      parent = board.tasks.find((task) => task.id === parent)?.parentId;
    }
  }
  const when = stamp();
  return touch({
    ...board,
    tasks: board.tasks.map((task) =>
      ids.has(task.id)
        ? { ...task, done: Boolean(done), completedAt: done ? when : null, updatedAt: when }
        : task,
    ),
  });
}

export function descendantIds(tasks, id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of tasks) {
      if (task.parentId && ids.has(task.parentId) && !ids.has(task.id)) {
        ids.add(task.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function deleteTask(board, id) {
  const ids = descendantIds(board.tasks, id);
  const removed = board.tasks.filter((task) => ids.has(task.id));
  if (removed.length === 0) return { board, removed: [] };
  return {
    board: touch({
      ...board,
      tasks: board.tasks.filter((task) => !ids.has(task.id)),
      tombstones: bury(board.tombstones, ids),
    }),
    removed,
  };
}

export function restoreTasks(board, removed) {
  if (!removed?.length) return board;
  const ids = new Set(board.tasks.map((task) => task.id));
  const revived = stamp();
  const back = new Set(removed.map((task) => task.id));
  const tasks = [
    ...board.tasks,
    ...removed.filter((task) => !ids.has(task.id)).map((task) => ({ ...task, updatedAt: revived })),
  ];
  return touch({
    ...board,
    tasks,
    tombstones: (board.tombstones || []).filter((item) => !back.has(item.id)),
  });
}

export function addEntry(board, text, at = new Date()) {
  const clean = cleanTitle(text);
  if (!clean) return board;
  const createdAt = stamp();
  const entry = { id: crypto.randomUUID(), text: clean, at: new Date(at).toISOString(), createdAt, updatedAt: createdAt };
  return touch({ ...board, entries: [...(board.entries || []), entry] });
}

export function deleteEntry(board, id) {
  const removed = (board.entries || []).filter((entry) => entry.id === id);
  if (removed.length === 0) return { board, removed };
  return {
    board: touch({
      ...board,
      entries: board.entries.filter((entry) => entry.id !== id),
      tombstones: bury(board.tombstones, [id]),
    }),
    removed,
  };
}

export function restoreEntries(board, removed) {
  if (!removed?.length) return board;
  const ids = new Set((board.entries || []).map((entry) => entry.id));
  const revived = stamp();
  const back = new Set(removed.map((entry) => entry.id));
  return touch({
    ...board,
    entries: [
      ...(board.entries || []),
      ...removed.filter((entry) => !ids.has(entry.id)).map((entry) => ({ ...entry, updatedAt: revived })),
    ],
    tombstones: (board.tombstones || []).filter((item) => !back.has(item.id)),
  });
}

export function reorderTasks(board, orderedIds) {
  const rank = new Map(orderedIds.map((id, index) => [id, orderedIds.length - index]));
  const when = stamp();
  return touch({
    ...board,
    tasks: board.tasks.map((task) =>
      rank.has(task.id) ? { ...task, position: rank.get(task.id), updatedAt: when } : task,
    ),
  });
}

function mergeById(left, right, tombstones) {
  const map = new Map();
  for (const record of [...left, ...right]) {
    const prev = map.get(record.id);
    if (!prev || recordTime(record) >= recordTime(prev)) map.set(record.id, record);
  }
  for (const tomb of tombstones) {
    const record = map.get(tomb.id);
    if (record && tomb.deletedAt >= recordTime(record)) map.delete(tomb.id);
  }
  return [...map.values()];
}

export function mergeBoards(left, right) {
  const a = normalizeBoard(left);
  const b = normalizeBoard(right);
  const tombMap = new Map();
  for (const tomb of [...a.tombstones, ...b.tombstones]) {
    const prev = tombMap.get(tomb.id);
    if (!prev || tomb.deletedAt >= prev.deletedAt) tombMap.set(tomb.id, tomb);
  }
  const tombstones = [...tombMap.values()];
  const lists = mergeById(a.lists, b.lists, tombstones);
  const tasks = mergeById(a.tasks, b.tasks, tombstones);
  const entries = mergeById(a.entries, b.entries, tombstones);
  const habits = mergeById(a.habits, b.habits, tombstones);
  const checks = mergeById(a.checks, b.checks, tombstones);
  const live = new Set([...lists, ...tasks, ...entries, ...habits, ...checks].map((record) => record.id));
  return {
    lists,
    tasks,
    entries,
    habits,
    checks,
    tombstones: tombstones.filter((tomb) => !live.has(tomb.id)),
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
  };
}

export function childrenOf(board, id) {
  return board.tasks
    .filter((task) => task.parentId === id)
    .slice()
    .sort((a, b) => b.position - a.position);
}

function compareOpen(a, b) {
  return (
    (a.dueAt || '').localeCompare(b.dueAt || '') ||
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
    b.position - a.position
  );
}

/** Tasks that may trade places by dragging: same day, same priority. */
export function sameBand(a, b) {
  return (a.dueAt || '') === (b.dueAt || '') && a.priority === b.priority;
}

export function groupOpenTasks(board, listId, today = todayKey()) {
  const groups = { overdue: [], today: [], later: [], none: [] };
  const tasks = board.tasks.filter((task) => task.listId === listId && !task.parentId && !task.done);
  for (const task of tasks) {
    if (!task.dueAt) groups.none.push(task);
    else if (task.dueAt < today) groups.overdue.push(task);
    else if (task.dueAt === today) groups.today.push(task);
    else groups.later.push(task);
  }
  for (const group of Object.values(groups)) group.sort(compareOpen);
  return groups;
}

export function doneTasks(board, listId) {
  return board.tasks
    .filter((task) => task.listId === listId && !task.parentId && task.done)
    .slice()
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
}

export function shiftDay(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  return todayKey(new Date(year, month - 1, day + days));
}

/** `choice` is what the add and edit forms hold: { kind: 'none' | 'today' | 'tomorrow' | 'pick', date }. */
export function resolveDue(choice, today = todayKey()) {
  if (choice.kind === 'today') return today;
  if (choice.kind === 'tomorrow') return shiftDay(today, 1);
  if (choice.kind === 'pick') return cleanDue(choice.date);
  return null;
}

export function dueChoice(dueAt, today = todayKey()) {
  if (!dueAt) return { kind: 'none', date: '' };
  if (dueAt === today) return { kind: 'today', date: dueAt };
  if (dueAt === shiftDay(today, 1)) return { kind: 'tomorrow', date: dueAt };
  return { kind: 'pick', date: dueAt };
}

export function dayInZone(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return todayKey(date);
  }
}

export function reminderMessage(due, today = todayKey()) {
  const tasks = due.slice().sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  if (tasks.length === 1) {
    const [task] = tasks;
    const body = task.dueAt < today ? `${task.title} is overdue` : `${task.title} is due today`;
    return { title: 'Daymark', body, tag: 'daymark-reminder' };
  }
  const names = tasks.slice(0, 3).map((task) => task.title).join(', ');
  const more = tasks.length > 3 ? `, and ${tasks.length - 3} more` : '';
  return { title: 'Daymark', body: `${tasks.length} tasks due: ${names}${more}`, tag: 'daymark-reminder' };
}

/** Changes whenever the day or time does, so an edited reminder fires again. */
export function reminderKey(task) {
  return `${task.dueAt} ${task.remindAt || DEFAULT_REMIND_AT}`;
}

function zoneOffset(timeZone, ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wall - Math.floor(ms / 1000) * 1000;
}

/** The moment a reminder is due, reading its time in the zone it was set in. */
export function reminderInstant(task, fallbackZone) {
  const [year, month, day] = task.dueAt.split('-').map(Number);
  const [hour, minute] = (task.remindAt || DEFAULT_REMIND_AT).split(':').map(Number);
  const zone = task.remindTz || fallbackZone;
  if (!zone) return new Date(year, month - 1, day, hour, minute).getTime();
  try {
    const wall = Date.UTC(year, month - 1, day, hour, minute);
    const guess = wall - zoneOffset(zone, wall);
    return wall - zoneOffset(zone, guess);
  } catch {
    return new Date(year, month - 1, day, hour, minute).getTime();
  }
}

function waiting(task) {
  return Boolean(task.remind && !task.done && task.dueAt) && task.remindedOn !== reminderKey(task);
}

export function remindersDue(board, now = Date.now(), fallbackZone) {
  return board.tasks.filter((task) => waiting(task) && reminderInstant(task, fallbackZone) <= now);
}

export function remindersForDay(board, today = todayKey()) {
  return board.tasks.filter((task) => waiting(task) && task.dueAt <= today);
}

export function defaultRemindAt(dueAt, now = new Date()) {
  if (dueAt !== todayKey(now) || now.getHours() < 9) return DEFAULT_REMIND_AT;
  return `${String(Math.min(now.getHours() + 1, 23)).padStart(2, '0')}:00`;
}

const localDay = (iso) => todayKey(new Date(iso));

export function dayDiff(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** Days past the due day it was finished on. 0 means on time, including tasks with no date. */
export function daysLate(task, dayOf = localDay) {
  if (!task.dueAt || !task.completedAt) return 0;
  return Math.max(0, dayDiff(task.dueAt, dayOf(task.completedAt)));
}

function finished(board) {
  return board.tasks.filter((task) => !task.parentId && task.done && task.completedAt);
}

function habitNames(board) {
  return new Map((board.habits || []).map((habit) => [habit.id, habit.name]));
}

function checksOn(board, day) {
  const names = habitNames(board);
  return (board.checks || []).filter((check) => check.day === day && names.has(check.habitId));
}

/** Everything that happened on one day, oldest first. */
export function dayActivity(board, day, dayOf = localDay) {
  const top = board.tasks.filter((task) => !task.parentId);
  const names = habitNames(board);
  const items = [
    ...checksOn(board, day).map((check) => ({
      kind: 'habit',
      id: check.id,
      text: names.get(check.habitId),
      at: check.at,
    })),
    ...(board.entries || [])
      .filter((entry) => dayOf(entry.at) === day)
      .map((entry) => ({ kind: 'logged', id: entry.id, text: entry.text, at: entry.at })),
    ...top
      .filter((task) => dayOf(task.createdAt) === day)
      .map((task) => ({ kind: 'added', id: task.id, text: task.title, at: task.createdAt })),
    ...finished(board)
      .filter((task) => dayOf(task.completedAt) === day)
      .map((task) => ({ kind: 'done', id: task.id, text: task.title, at: task.completedAt, late: daysLate(task, dayOf) })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

export function activityDays(board, dayOf = localDay) {
  const days = new Set((board.entries || []).map((entry) => dayOf(entry.at)));
  const names = habitNames(board);
  for (const check of board.checks || []) if (names.has(check.habitId)) days.add(check.day);
  for (const task of board.tasks) {
    if (task.parentId) continue;
    days.add(dayOf(task.createdAt));
    if (task.done && task.completedAt) days.add(dayOf(task.completedAt));
  }
  return [...days].sort().reverse();
}

export function activityWeek(board, endDay, length = 7, dayOf = localDay) {
  const done = finished(board);
  const week = [];
  for (let back = length - 1; back >= 0; back -= 1) {
    const day = shiftDay(endDay, -back);
    const that = done.filter((task) => dayOf(task.completedAt) === day);
    const late = that.filter((task) => daysLate(task, dayOf) > 0).length;
    week.push({
      day,
      onTime: that.length - late,
      late,
      habits: checksOn(board, day).length,
      logged: (board.entries || []).filter((entry) => dayOf(entry.at) === day).length,
    });
  }
  return week;
}

export function weekdayOf(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function addHabit(board, name, days = ALL_DAYS) {
  const title = cleanTitle(name, 80);
  if (!title) return board;
  const habits = board.habits || [];
  const createdAt = stamp();
  const position = habits.reduce((max, habit) => Math.max(max, habit.position), -1) + 1;
  const habit = { id: crypto.randomUUID(), name: title, days: cleanDays(days), position, createdAt, updatedAt: createdAt };
  return touch({ ...board, habits: [...habits, habit] });
}

export function updateHabit(board, id, patch) {
  const name = patch.name === undefined ? undefined : cleanTitle(patch.name, 80);
  if (patch.name !== undefined && !name) return board;
  return touch({
    ...board,
    habits: (board.habits || []).map((habit) =>
      habit.id !== id
        ? habit
        : {
            ...habit,
            name: name === undefined ? habit.name : name,
            days: patch.days === undefined ? habit.days : cleanDays(patch.days),
            updatedAt: stamp(),
          },
    ),
  });
}

export function deleteHabit(board, id) {
  const habit = (board.habits || []).find((item) => item.id === id);
  if (!habit) return { board, removed: null };
  const checks = (board.checks || []).filter((check) => check.habitId === id);
  return {
    board: touch({
      ...board,
      habits: board.habits.filter((item) => item.id !== id),
      checks: (board.checks || []).filter((check) => check.habitId !== id),
      tombstones: bury(board.tombstones, [id, ...checks.map((check) => check.id)]),
    }),
    removed: { habit, checks },
  };
}

export function restoreHabit(board, removed) {
  if (!removed?.habit) return board;
  const revived = stamp();
  const back = new Set([removed.habit.id, ...removed.checks.map((check) => check.id)]);
  const habits = (board.habits || []).some((habit) => habit.id === removed.habit.id)
    ? board.habits
    : [...(board.habits || []), { ...removed.habit, updatedAt: revived }];
  const have = new Set((board.checks || []).map((check) => check.id));
  return touch({
    ...board,
    habits,
    checks: [
      ...(board.checks || []),
      ...removed.checks.filter((check) => !have.has(check.id)).map((check) => ({ ...check, updatedAt: revived })),
    ],
    tombstones: (board.tombstones || []).filter((item) => !back.has(item.id)),
  });
}

export function habitChecked(board, habitId, day) {
  return (board.checks || []).some((check) => check.id === checkId(habitId, day));
}

export function checkHabit(board, habitId, day, done, at = new Date()) {
  const id = checkId(habitId, day);
  const checks = board.checks || [];
  const has = checks.some((check) => check.id === id);
  if (done === has) return board;
  if (!done) return touch({ ...board, checks: checks.filter((check) => check.id !== id), tombstones: bury(board.tombstones, [id]) });
  const when = stamp();
  return touch({
    ...board,
    checks: [...checks, { id, habitId, day, at: new Date(at).toISOString(), createdAt: when, updatedAt: when }],
    tombstones: (board.tombstones || []).filter((item) => item.id !== id),
  });
}

export function habitScheduled(habit, day) {
  return habit.days.includes(weekdayOf(day));
}

/**
 * Streaks count scheduled days in a row; rest days neither add nor break them, and today
 * only breaks a streak once it is over.
 */
export function habitStats(board, habit, today = todayKey()) {
  const done = new Set((board.checks || []).filter((check) => check.habitId === habit.id).map((check) => check.day));
  let start = todayKey(new Date(habit.createdAt));
  for (const day of done) if (day < start) start = day;
  if (dayDiff(start, today) > 730) start = shiftDay(today, -730);

  let current = 0;
  let day = today;
  if (habitScheduled(habit, day) && !done.has(day)) day = shiftDay(day, -1);
  for (; day >= start; day = shiftDay(day, -1)) {
    if (!habitScheduled(habit, day)) continue;
    if (!done.has(day)) break;
    current += 1;
  }

  let best = 0;
  let run = 0;
  for (let d = start; d <= today; d = shiftDay(d, 1)) {
    if (!habitScheduled(habit, d)) continue;
    if (done.has(d)) {
      run += 1;
      best = Math.max(best, run);
    } else if (d < today) {
      run = 0;
    }
  }

  let due = 0;
  let hit = 0;
  for (let back = 0; back < 30; back += 1) {
    const d = shiftDay(today, -back);
    if (d < start) break;
    if (!habitScheduled(habit, d) || (d === today && !done.has(d))) continue;
    due += 1;
    if (done.has(d)) hit += 1;
  }
  return { current, best, rate: due > 0 ? hit / due : null };
}

/** Habits in order, how many of today's are done, and tasks due today or earlier that are still open. */
export function todayPlan(board, today = todayKey()) {
  const habits = (board.habits || []).slice().sort((a, b) => a.position - b.position);
  const scheduled = habits.filter((habit) => habitScheduled(habit, today));
  const done = scheduled.filter((habit) => habitChecked(board, habit.id, today)).length;
  const tasks = board.tasks
    .filter((task) => !task.parentId && !task.done && task.dueAt && task.dueAt <= today)
    .sort(compareOpen);
  return { habits, scheduled: scheduled.length, done, tasks };
}
