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

export function addTask(board, { listId = 'inbox', title, dueAt = null, parentId = null, remind = false } = {}) {
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

export function groupOpenTasks(board, listId, today = todayKey()) {
  const groups = { overdue: [], today: [], later: [], none: [] };
  const tasks = board.tasks
    .filter((task) => task.listId === listId && !task.parentId && !task.done)
    .slice()
    .sort((a, b) => b.position - a.position);
  for (const task of tasks) {
    if (!task.dueAt) groups.none.push(task);
    else if (task.dueAt < today) groups.overdue.push(task);
    else if (task.dueAt === today) groups.today.push(task);
    else groups.later.push(task);
  }
  const byDue = (a, b) => a.dueAt.localeCompare(b.dueAt) || b.position - a.position;
  groups.overdue.sort(byDue);
  groups.today.sort(byDue);
  groups.later.sort(byDue);
  return groups;
}

export function doneTasks(board, listId) {
  return board.tasks
    .filter((task) => task.listId === listId && !task.parentId && task.done)
    .slice()
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
}

export function dueLabel(dueAt, today = todayKey()) {
  if (!dueAt) return '';
  if (dueAt === today) return 'Today';
  if (dueAt < today) return 'Overdue';
  return dueAt;
}
