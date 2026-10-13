import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const FILE = path.join(process.cwd(), 'engine', 'var', 'board.json');

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

export async function readBoard() {
  if (storeMode() === 'redis') {
    const data = await kvCommand(['GET', 'daymark-board']);
    if (!data.result) return null;
    return JSON.parse(data.result);
  }
  if (storeMode() === 'off') {
    const err = new Error('Shared list is not configured');
    err.code = 'NO_STORE';
    throw err;
  }
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeBoard(board) {
  if (storeMode() === 'redis') {
    await kvCommand(['SET', 'daymark-board', JSON.stringify(board)]);
    return;
  }
  if (storeMode() === 'off') {
    const err = new Error('Shared list is not configured');
    err.code = 'NO_STORE';
    throw err;
  }
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(board));
}
