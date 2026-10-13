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

export function emptyBoard() {
  return {
    lists: [{ id: 'inbox', name: 'Inbox', createdAt: new Date().toISOString(), updatedAt: new Date(0).toISOString() }],
    tasks: [],
    tombstones: [],
    updatedAt: new Date(0).toISOString(),
  };
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
      remindedOn: task.remindedOn || null,
      position: Number.isFinite(task.position) ? task.position : index,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || task.createdAt || new Date(0).toISOString(),
      completedAt: task.completedAt || null,
    }));

  const tombstones = (Array.isArray(base.tombstones) ? base.tombstones : [])
    .filter((item) => item && item.id && item.deletedAt)
    .map((item) => ({ id: String(item.id), deletedAt: String(item.deletedAt) }));

  return {
    lists: cleanLists,
    tasks,
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
  { listId = 'inbox', title, dueAt = null, parentId = null, remind = false, priority = 'none' } = {},
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
      const dueChanged = due !== undefined && nextDue !== task.dueAt;
      return {
        ...task,
        title: title === undefined ? task.title : title,
        dueAt: nextDue,
        priority: patch.priority === undefined ? task.priority : cleanPriority(patch.priority),
        remind: nextRemind && Boolean(nextDue),
        remindedOn: patch.remindedOn !== undefined ? patch.remindedOn : dueChanged ? null : task.remindedOn,
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
  const live = new Set([...lists, ...tasks].map((record) => record.id));
  return {
    lists,
    tasks,
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

export const REMIND_HOUR = 9;

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

export function remindersDue(board, today = todayKey(), hour = new Date().getHours()) {
  return board.tasks.filter((task) => {
    if (!task.remind || task.done || !task.dueAt || task.remindedOn === task.dueAt) return false;
    return task.dueAt < today || (task.dueAt === today && hour >= REMIND_HOUR);
  });
}
