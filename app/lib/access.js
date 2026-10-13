import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { kvCommand, readJson, storeMode, writeJson } from './boardStore.js';

const MAX_WRONG = 5;
const WAIT_SECONDS = 15 * 60;
const DEFAULT_UNLOCK_HOURS = 24;
const ONE_VISIT_HOURS = 12;
const wrongHere = new Map();
let savedSecret = null;

function passcodeRule() {
  const mode = storeMode();
  if (mode === 'off') return { mode, state: 'off' };
  const expected = process.env.DAYMARK_PASSCODE || '';
  if (!expected) return { mode, state: mode === 'redis' ? 'unset' : 'open' };
  if (!/^\d{4}$/.test(expected)) return { mode, state: 'unset' };
  return { mode, state: 'needed', expected };
}

/**
 * 'open' lets the request through and 'locked' means its pass is missing, expired, or
 * from an old passcode. 'unset' means a database is connected but DAYMARK_PASSCODE is
 * not four digits, and 'off' means nothing is shared.
 */
export async function requestAccess(request) {
  const { state, expected } = passcodeRule();
  if (state !== 'needed') return state;
  const pass = request.headers.get('x-daymark-session') || '';
  if (!pass) return 'locked';
  try {
    return (await validPass(pass, expected)) ? 'open' : 'locked';
  } catch {
    return 'error';
  }
}

/** Trades the four digits for a pass that runs out. 'throttled' after five wrong tries. */
export async function unlock(request, passcode) {
  const { mode, state, expected } = passcodeRule();
  if (state !== 'needed') return { access: state };
  if (!passcode) return { access: 'locked' };
  const key = `daymark-wrong:${clientAddress(request)}`;
  try {
    if ((await wrongTries(mode, key)) >= MAX_WRONG) return { access: 'throttled' };
    if (!matches(passcode, expected)) {
      return { access: (await countWrongTry(mode, key)) >= MAX_WRONG ? 'throttled' : 'locked' };
    }
    const { hours, persist } = unlockLength();
    const expiresAt = Date.now() + Math.round(hours * 60 * 60 * 1000);
    return { access: 'open', pass: await signPass(expiresAt, expected), expiresAt, persist };
  } catch {
    return { access: 'error' };
  }
}

/** DAYMARK_UNLOCK_HOURS=0 asks on every visit: the pass is kept only until Daymark closes. */
function unlockLength() {
  const raw = process.env.DAYMARK_UNLOCK_HOURS;
  const hours = raw === undefined || raw === '' ? DEFAULT_UNLOCK_HOURS : Number(raw);
  if (!Number.isFinite(hours) || hours < 0) return { hours: DEFAULT_UNLOCK_HOURS, persist: true };
  if (hours === 0) return { hours: ONE_VISIT_HOURS, persist: false };
  return { hours: Math.min(hours, 24 * 365), persist: true };
}

async function signingKey(expected) {
  const secret = process.env.DAYMARK_SESSION_SECRET || (await storedSecret());
  return createHash('sha256').update(`${secret}:${expected}`).digest();
}

async function storedSecret() {
  if (savedSecret) return savedSecret;
  const saved = await readJson('session-secret');
  if (!saved?.secret) {
    await writeJson('session-secret', { secret: randomBytes(32).toString('base64url') }, { onlyIfMissing: true });
  }
  savedSecret = (saved?.secret ? saved : await readJson('session-secret')).secret;
  return savedSecret;
}

async function signPass(expiresAt, expected) {
  const body = String(expiresAt);
  const signature = createHmac('sha256', await signingKey(expected)).update(body).digest('base64url');
  return `${body}.${signature}`;
}

async function validPass(pass, expected) {
  const [body, signature] = pass.split('.');
  const expiresAt = Number(body);
  if (!body || !signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const want = createHmac('sha256', await signingKey(expected)).update(body).digest();
  const got = Buffer.from(signature, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
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
