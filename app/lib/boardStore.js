import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const DIR = path.join(process.cwd(), 'engine', 'var');

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

async function kvCommand(command) {
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
    return JSON.parse(await readFile(path.join(DIR, `${name}.json`), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeJson(name, value, { onlyIfMissing = false } = {}) {
  const mode = storeMode();
  if (mode === 'off') throw noStore();
  const text = JSON.stringify(value);
  if (mode === 'redis') {
    const command = ['SET', `daymark-${name}`, text];
    await kvCommand(onlyIfMissing ? [...command, 'NX'] : command);
    return;
  }
  if (onlyIfMissing && (await readJson(name)) !== null) return;
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, `${name}.json`), text);
}

export function readBoard() {
  return readJson('board');
}

export function writeBoard(board) {
  return writeJson('board', board);
}
