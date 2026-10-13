import { emptyBoard, normalizeBoard } from './board';

const KEY = 'gokul-v1'; // kept so tasks saved under the old name still load
const LIST_KEY = 'daymark-list';
const PASS_KEY = 'daymark-pass';
const OLD_PASSCODE_KEY = 'daymark-passcode';

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

/** The signed pass from unlocking, or null once it has run out. */
export function loadPass() {
  if (typeof window === 'undefined') return null;
  for (const store of [sessionStorage, localStorage]) {
    try {
      const saved = JSON.parse(store.getItem(PASS_KEY) || 'null');
      if (saved?.pass && saved.expiresAt > Date.now()) return saved;
    } catch {}
  }
  return null;
}

export function savePass({ pass, expiresAt, persist }) {
  clearPass();
  const store = persist ? localStorage : sessionStorage;
  store.setItem(PASS_KEY, JSON.stringify({ pass, expiresAt }));
}

export function clearPass() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PASS_KEY);
  sessionStorage.removeItem(PASS_KEY);
  localStorage.removeItem(OLD_PASSCODE_KEY);
}
