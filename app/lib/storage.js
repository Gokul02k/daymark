const KEY = 'gokul-v1'; // kept so tasks saved under the old name still load

function emptyState() {
  return {
    lists: [
      {
        id: 'inbox',
        name: 'Inbox',
        createdAt: new Date().toISOString(),
      },
    ],
    tasks: [],
  };
}

export function loadPersisted() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePersisted(data) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage save failed', e);
  }
}

/** Tasks for the installed app live on the device. Vercel has no durable disk. */
export function loadState() {
  const saved = loadPersisted();
  if (!saved || !Array.isArray(saved.lists) || saved.lists.length === 0 || !Array.isArray(saved.tasks)) {
    return emptyState();
  }
  return saved;
}

export function addTask(state, title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim();
  if (!text) return state;
  const task = {
    id: crypto.randomUUID(),
    listId: state.lists[0].id,
    title: text.slice(0, 200),
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  return { ...state, tasks: [task, ...state.tasks] };
}

export function setDone(state, id, done) {
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === id
        ? { ...task, done, completedAt: done ? new Date().toISOString() : null }
        : task,
    ),
  };
}

export function deleteTask(state, id) {
  return {
    ...state,
    tasks: state.tasks.filter((task) => task.id !== id),
  };
}
