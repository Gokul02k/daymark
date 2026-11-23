import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { accountInfo, cleanUsername, requestAccess, signIn, signUp } from '../app/lib/access.js';
import { listUsers, readBoard } from '../app/lib/boardStore.js';

const KEYS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'VERCEL',
  'DAYMARK_PASSCODE',
  'DAYMARK_UNLOCK_HOURS',
  'DAYMARK_SESSION_SECRET',
  'DAYMARK_DATA_DIR',
];

async function withEnv(values, fn) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  const dir = await mkdtemp(path.join(tmpdir(), 'daymark-test-'));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, { DAYMARK_SESSION_SECRET: 'test-secret', DAYMARK_DATA_DIR: dir }, values);
  try {
    await fn(dir);
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
}

function from(ip, pass) {
  const headers = { 'x-real-ip': ip };
  if (pass) headers['x-daymark-session'] = pass;
  return { headers: new Headers(headers) };
}

const KV = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'token' };

test('usernames are tidied to lowercase and odd ones are refused', () => {
  assert.equal(cleanUsername('  Asha '), 'asha');
  assert.equal(cleanUsername('ravi.k_2'), 'ravi.k_2');
  assert.equal(cleanUsername('ab'), null);
  assert.equal(cleanUsername('../board'), null);
  assert.equal(cleanUsername('a b c'), null);
  assert.equal(cleanUsername(42), null);
});

test('a connected database refuses sign-ups until an invite code is set', async () => {
  await withEnv(KV, async () => {
    assert.deepEqual(accountInfo(), { accounts: true, signup: 'closed' });
    assert.equal((await signUp(from('203.0.113.1'), { username: 'asha', password: 'secret-1' })).access, 'closed');
    assert.equal((await requestAccess(from('203.0.113.1'))).access, 'locked');
  });
});

test('two people get their own accounts, passes, and lists', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821' }, async (dir) => {
    const ip = '203.0.113.2';
    assert.equal((await signUp(from(ip), { username: 'asha', password: 'secret-1', invite: '1111' })).access, 'invite');
    const asha = await signUp(from(ip), { username: 'Asha', password: 'secret-1', invite: '4821' });
    assert.equal(asha.access, 'open');
    assert.equal(asha.user, 'asha');
    assert.ok(Math.abs(asha.expiresAt - Date.now() - 30 * 24 * 60 * 60 * 1000) < 5000);
    const ravi = await signUp(from(ip), { username: 'ravi', password: 'other-pw', invite: '4821' });
    assert.equal(ravi.access, 'open');
    assert.deepEqual(await listUsers(), ['asha', 'ravi']);

    assert.deepEqual(await requestAccess(from(ip, asha.pass)), { access: 'open', user: 'asha' });
    assert.deepEqual(await requestAccess(from(ip, ravi.pass)), { access: 'open', user: 'ravi' });
    assert.equal((await requestAccess(from(ip, `${asha.pass}x`))).access, 'locked');
    const forged = asha.pass.replace('asha~', 'ravi~');
    assert.equal((await requestAccess(from(ip, forged))).access, 'locked');

    const saved = JSON.parse(await readFile(path.join(dir, 'account-asha.json'), 'utf8'));
    assert.ok(!JSON.stringify(saved).includes('secret-1'), 'the password is never stored as typed');
  });
});

test('a taken username, a short password, and a bad name are each refused', async () => {
  await withEnv({}, async () => {
    const ip = '203.0.113.3';
    assert.equal((await signUp(from(ip), { username: 'asha', password: 'secret-1' })).access, 'open');
    assert.equal((await signUp(from(ip), { username: 'ASHA', password: 'secret-2' })).access, 'taken');
    assert.equal((await signUp(from(ip), { username: 'ravi', password: '123' })).access, 'password');
    assert.equal((await signUp(from(ip), { username: 'ravi', password: '1234' })).access, 'open');
    assert.equal((await signUp(from(ip), { username: '!!', password: 'secret-1' })).access, 'username');
  });
});

test('signing in needs the right password, and five wrong tries shut the address out', async () => {
  await withEnv({}, async () => {
    const ip = '203.0.113.4';
    await signUp(from(ip), { username: 'asha', password: 'secret-1' });
    assert.equal((await signIn(from(ip), { username: 'asha', password: 'secret-1' })).access, 'open');
    assert.equal((await signIn(from(ip), { username: 'nobody', password: 'secret-1' })).access, 'wrong');
    for (const guess of ['a', 'b', 'c']) {
      assert.equal((await signIn(from(ip), { username: 'asha', password: guess })).access, 'wrong');
    }
    assert.equal((await signIn(from(ip), { username: 'asha', password: 'd' })).access, 'throttled');
    assert.equal((await signIn(from(ip), { username: 'asha', password: 'secret-1' })).access, 'throttled');
    assert.equal((await signIn(from('203.0.113.5'), { username: 'asha', password: 'secret-1' })).access, 'open');
  });
});

test('a pass runs out, and DAYMARK_UNLOCK_HOURS=0 keeps it only for this visit', async () => {
  await withEnv({ DAYMARK_UNLOCK_HOURS: '0.0000005' }, async () => {
    const result = await signUp(from('203.0.113.6'), { username: 'asha', password: 'secret-1' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await requestAccess(from('203.0.113.6', result.pass))).access, 'locked');
  });
  await withEnv({ DAYMARK_UNLOCK_HOURS: '0' }, async () => {
    const result = await signUp(from('203.0.113.7'), { username: 'asha', password: 'secret-1' });
    assert.equal(result.persist, false);
  });
});

test('the first account takes over the list from before accounts, and only the first', async () => {
  await withEnv({}, async (dir) => {
    await writeFile(path.join(dir, 'board.json'), JSON.stringify({ tasks: [{ id: 't1', title: 'Old task' }] }));
    await signUp(from('203.0.113.8'), { username: 'asha', password: 'secret-1' });
    await signUp(from('203.0.113.8'), { username: 'ravi', password: 'secret-2' });
    assert.equal((await readBoard('asha')).tasks[0].title, 'Old task');
    assert.equal(await readBoard('ravi'), null);
  });
});

test('Vercel without a database has no accounts and no shared list', async () => {
  await withEnv({ VERCEL: '1' }, async () => {
    assert.equal((await requestAccess(from('203.0.113.9'))).access, 'off');
    assert.deepEqual(accountInfo(), { accounts: false, signup: 'off' });
  });
});
