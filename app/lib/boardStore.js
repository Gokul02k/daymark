import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import path from 'path';

// DAYMARK_DATA_DIR lets tests keep their own folder.
function dataDir() {
  return process.env.DAYMARK_DATA_DIR || path.join(process.cwd(), 'engine', 'var');
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

export async function kvCommand(command) {
  const kv = kvConfig();
  const res = await fetch(kv.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kv.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Could not reach the shared list');
  return res.json();
}

export function storeMode() {
  if (kvConfig()) return 'redis';
  if (process.env.VERCEL) return 'off';
  return 'file';
}

function noStore() {
  const err = new Error('Shared list is not configured');
  err.code = 'NO_STORE';
  return err;
}

export async function readJson(name) {
  const mode = storeMode();
  if (mode === 'off') throw noStore();
  if (mode === 'redis') {
    const data = await kvCommand(['GET', `daymark-${name}`]);
    return data.result ? JSON.parse(data.result) : null;
  }
  try {
    return JSON.parse(await readFile(path.join(dataDir(), `${name}.json`), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Returns false when `onlyIfMissing` is set and something was already saved under `name`. */
export async function writeJson(name, value, { onlyIfMissing = false } = {}) {
  const mode = storeMode();
  if (mode === 'off') throw noStore();
  const text = JSON.stringify(value);
  if (mode === 'redis') {
    const command = ['SET', `daymark-${name}`, text];
    const data = await kvCommand(onlyIfMissing ? [...command, 'NX'] : command);
    return !onlyIfMissing || data.result === 'OK';
  }
  await mkdir(dataDir(), { recursive: true });
  const file = path.join(dataDir(), `${name}.json`);
  if (onlyIfMissing) {
    try {
      await writeFile(file, text, { flag: 'wx' });
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') return false;
      throw err;
    }
  }
  await writeFile(file, text);
  return true;
}

/** Each account keeps its own list. With no account (the old single list), the name is plain `board`. */
function own(name, user) {
  return user ? `${name}-${user}` : name;
}

export function readBoard(user) {
  return readJson(own('board', user));
}

export function writeBoard(user, board) {
  return writeJson(own('board', user), board);
}

export function readOwn(name, user) {
  return readJson(own(name, user));
}

export function writeOwn(name, user, value) {
  return writeJson(own(name, user), value);
}

/** Every account name, so the reminder job can visit each list. */
export async function listUsers() {
  const mode = storeMode();
  if (mode === 'off') return [];
  if (mode === 'redis') {
    const data = await kvCommand(['SMEMBERS', 'daymark-users']);
    return Array.isArray(data.result) ? data.result.sort() : [];
  }
  try {
    const files = await readdir(dataDir());
    return files
      .map((file) => /^account-(.+)\.json$/.exec(file)?.[1])
      .filter(Boolean)
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function rememberUser(user) {
  if (storeMode() === 'redis') await kvCommand(['SADD', 'daymark-users', user]);
}
