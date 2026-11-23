import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { kvCommand, readBoard, readJson, rememberUser, storeMode, writeBoard, writeJson } from './boardStore.js';

const MAX_WRONG = 5;
const WAIT_SECONDS = 15 * 60;
const DEFAULT_UNLOCK_HOURS = 30 * 24;
const ONE_VISIT_HOURS = 12;
const MIN_PASSWORD = 4;
const MAX_PASSWORD = 200;
const wrongHere = new Map();
let savedSecret = null;

/** Lowercase letters, digits, dot, dash, and underscore, 3 to 24 long, starting with a letter or digit. */
export function cleanUsername(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,23}$/.test(name) ? name : null;
}

/**
 * Who may sign up. DAYMARK_PASSCODE is the invite code a new person types once.
 * With a shared database and no invite code, nobody can sign up, so a public
 * deployment never turns into an open one. On this computer, signing up is open.
 */
function signupRule() {
  const mode = storeMode();
  if (mode === 'off') return { mode, state: 'off' };
  const invite = (process.env.DAYMARK_PASSCODE || '').trim();
  if (invite.length >= 4) return { mode, state: 'invite', invite };
  return { mode, state: mode === 'redis' ? 'closed' : 'open' };
}

/** What the sign-in screen needs to know before anyone has signed in. */
export function accountInfo() {
  const { state } = signupRule();
  return { accounts: state !== 'off', signup: state };
}

/**
 * `{ access: 'open', user }` lets the request through. 'locked' means its pass is
 * missing, expired, or from before a password change, and 'off' means nothing is shared.
 */
export async function requestAccess(request) {
  if (storeMode() === 'off') return { access: 'off' };
  const pass = request.headers.get('x-daymark-session') || '';
  if (!pass) return { access: 'locked' };
  try {
    const user = await validPass(pass);
    return user ? { access: 'open', user } : { access: 'locked' };
  } catch {
    return { access: 'error' };
  }
}

/** Trades a username and password for a pass that runs out. 'throttled' after five wrong tries. */
export async function signIn(request, { username, password } = {}) {
  const { mode, state } = signupRule();
  if (state === 'off') return { access: 'off' };
  const key = `daymark-wrong:${clientAddress(request)}`;
  try {
    if ((await wrongTries(mode, key)) >= MAX_WRONG) return { access: 'throttled' };
    const user = cleanUsername(username);
    const account = user ? await readJson(`account-${user}`) : null;
    const ok = account && typeof password === 'string' && (await samePassword(password, account));
    if (!ok) {
      return { access: (await countWrongTry(mode, key)) >= MAX_WRONG ? 'throttled' : 'wrong' };
    }
    return { access: 'open', user, ...(await passFor(user, account)) };
  } catch {
    return { access: 'error' };
  }
}

/** Makes a new account. The first one also takes over the list from before accounts existed. */
export async function signUp(request, { username, password, invite } = {}) {
  const { mode, state, invite: expected } = signupRule();
  if (state === 'off' || state === 'closed') return { access: state };
  const key = `daymark-wrong:${clientAddress(request)}`;
  try {
    if ((await wrongTries(mode, key)) >= MAX_WRONG) return { access: 'throttled' };
    if (state === 'invite' && !matches(typeof invite === 'string' ? invite.trim() : '', expected)) {
      return { access: (await countWrongTry(mode, key)) >= MAX_WRONG ? 'throttled' : 'invite' };
    }
    const user = cleanUsername(username);
    if (!user) return { access: 'username' };
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      return { access: 'password' };
    }
    const account = await hashPassword(password);
    account.createdAt = new Date().toISOString();
    if (!(await writeJson(`account-${user}`, account, { onlyIfMissing: true }))) return { access: 'taken' };
    await rememberUser(user);
    await claimOldList(user);
    return { access: 'open', user, created: true, ...(await passFor(user, account)) };
  } catch {
    return { access: 'error' };
  }
}

async function claimOldList(user) {
  const old = await readBoard();
  if (!old) return;
  if (!(await writeJson('old-list-owner', { user }, { onlyIfMissing: true }))) return;
  if (!(await readBoard(user))) await writeBoard(user, old);
}

async function passFor(user, account) {
  const { hours, persist } = unlockLength();
  const expiresAt = Date.now() + Math.round(hours * 60 * 60 * 1000);
  return { pass: await signPass(user, expiresAt, account), expiresAt, persist };
}

/** DAYMARK_UNLOCK_HOURS=0 asks on every visit: the pass is kept only until Daymark closes. */
function unlockLength() {
  const raw = process.env.DAYMARK_UNLOCK_HOURS;
  const hours = raw === undefined || raw === '' ? DEFAULT_UNLOCK_HOURS : Number(raw);
  if (!Number.isFinite(hours) || hours < 0) return { hours: DEFAULT_UNLOCK_HOURS, persist: true };
  if (hours === 0) return { hours: ONE_VISIT_HOURS, persist: false };
  return { hours: Math.min(hours, 24 * 365), persist: true };
}

function scryptHash(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = (await scryptHash(password, salt)).toString('base64url');
  return { salt, hash, stamp: randomBytes(9).toString('base64url') };
}

async function samePassword(password, account) {
  if (!account?.salt || !account?.hash) return false;
  const got = await scryptHash(password, account.salt);
  const want = Buffer.from(account.hash, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** A new password gets a new stamp, which signs out every device that used the old one. */
async function signingKey(account) {
  const secret = process.env.DAYMARK_SESSION_SECRET || (await storedSecret());
  return createHash('sha256').update(`${secret}:${account.stamp || ''}`).digest();
}

async function storedSecret() {
  if (savedSecret) return savedSecret;
  await writeJson('session-secret', { secret: randomBytes(32).toString('base64url') }, { onlyIfMissing: true });
  savedSecret = (await readJson('session-secret')).secret;
  return savedSecret;
}

async function signPass(user, expiresAt, account) {
  const body = `${user}~${expiresAt}`;
  const signature = createHmac('sha256', await signingKey(account)).update(body).digest('base64url');
  return `${body}.${signature}`;
}

async function validPass(pass) {
  const dot = pass.lastIndexOf('.');
  if (dot < 0) return null;
  const body = pass.slice(0, dot);
  const signature = pass.slice(dot + 1);
  const [name, stamp] = body.split('~');
  const user = cleanUsername(name);
  const expiresAt = Number(stamp);
  if (!user || user !== name || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const account = await readJson(`account-${user}`);
  if (!account) return null;
  const want = createHmac('sha256', await signingKey(account)).update(body).digest();
  const got = Buffer.from(signature, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want) ? user : null;
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
