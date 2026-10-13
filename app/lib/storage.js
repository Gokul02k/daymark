import { emptyBoard, normalizeBoard } from './board';

const KEY = 'gokul-v1'; // kept so tasks saved under the old name still load
const LIST_KEY = 'daymark-list';

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

export function loadState() {
  return normalizeBoard(loadPersisted() || emptyBoard());
}

export function loadSelectedList() {
  if (typeof window === 'undefined') return 'inbox';
  return localStorage.getItem(LIST_KEY) || 'inbox';
}

export function saveSelectedList(id) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LIST_KEY, id);
}
