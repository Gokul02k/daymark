import { createHash, timingSafeEqual } from 'crypto';
import { kvCommand, storeMode } from './boardStore.js';

const MAX_WRONG = 5;
const WAIT_SECONDS = 15 * 60;
const wrongHere = new Map();

/**
 * 'open' lets the request through. 'locked' means the passcode is missing or wrong, and
 * 'throttled' means too many wrong ones came from this address. 'unset' means a database
 * is connected but DAYMARK_PASSCODE is not four digits, and 'off' means nothing is shared.
 */
export async function requestAccess(request) {
  const mode = storeMode();
  if (mode === 'off') return 'off';
  const expected = process.env.DAYMARK_PASSCODE || '';
  if (!expected) return mode === 'redis' ? 'unset' : 'open';
  if (!/^\d{4}$/.test(expected)) return 'unset';

  const given = givenPasscode(request);
  if (!given) return 'locked';
  const key = `daymark-wrong:${clientAddress(request)}`;
  try {
    if ((await wrongTries(mode, key)) >= MAX_WRONG) return 'throttled';
    if (matches(given, expected)) return 'open';
    return (await countWrongTry(mode, key)) >= MAX_WRONG ? 'throttled' : 'locked';
  } catch {
    return 'error';
  }
}

function givenPasscode(request) {
  const raw = request.headers.get('x-daymark-passcode') || '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

function clientAddress(request) {
  const forwarded = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return request.headers.get('x-real-ip') || forwarded || 'unknown';
}

function matches(given, expected) {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

async function wrongTries(mode, key) {
  if (mode === 'redis') return Number((await kvCommand(['GET', key])).result) || 0;
  const entry = wrongHere.get(key);
  return entry && entry.until > Date.now() ? entry.count : 0;
}

async function countWrongTry(mode, key) {
  if (mode === 'redis') {
    const count = Number((await kvCommand(['INCR', key])).result) || 0;
    await kvCommand(['EXPIRE', key, WAIT_SECONDS]);
    return count;
  }
  const entry = wrongHere.get(key);
  const count = entry && entry.until > Date.now() ? entry.count + 1 : 1;
  wrongHere.set(key, { count, until: Date.now() + WAIT_SECONDS * 1000 });
  return count;
}
