import assert from 'node:assert/strict';
import test from 'node:test';
import { requestAccess, unlock } from '../app/lib/access.js';

const KEYS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'VERCEL',
  'DAYMARK_PASSCODE',
  'DAYMARK_UNLOCK_HOURS',
  'DAYMARK_SESSION_SECRET',
];

async function withEnv(values, fn) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, { DAYMARK_SESSION_SECRET: 'test-secret' }, values);
  try {
    await fn();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function from(ip, pass) {
  const headers = { 'x-real-ip': ip };
  if (pass) headers['x-daymark-session'] = pass;
  return { headers: new Headers(headers) };
}

const KV = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'token' };

test('a connected database stays shut until a four-digit passcode is set', async () => {
  await withEnv(KV, async () => assert.equal(await requestAccess(from('203.0.113.1')), 'unset'));
  await withEnv({ ...KV, DAYMARK_PASSCODE: 'blue river 7' }, async () => {
    assert.equal((await unlock(from('203.0.113.1'), 'blue river 7')).access, 'unset');
  });
  await withEnv({ ...KV, DAYMARK_PASSCODE: '4821' }, async () => {
    assert.equal(await requestAccess(from('203.0.113.1')), 'locked');
  });
});

test('the right four digits give a pass that opens the list for a day', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821' }, async () => {
    const ip = '203.0.113.2';
    assert.equal((await unlock(from(ip), '4820')).access, 'locked');
    const result = await unlock(from(ip), '4821');
    assert.equal(result.access, 'open');
    assert.equal(result.persist, true);
    assert.ok(Math.abs(result.expiresAt - Date.now() - 24 * 60 * 60 * 1000) < 5000);
    assert.equal(await requestAccess(from(ip, result.pass)), 'open');
    assert.equal(await requestAccess(from(ip, `${result.pass}x`)), 'locked');
    assert.equal(await requestAccess(from(ip, `${Date.now() + 1e9}.${result.pass.split('.')[1]}`)), 'locked');
  });
});

test('a pass runs out, and a new passcode turns old passes away', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821', DAYMARK_UNLOCK_HOURS: '0.0000005' }, async () => {
    const result = await unlock(from('203.0.113.3'), '4821');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(await requestAccess(from('203.0.113.3', result.pass)), 'locked');
  });
  let pass;
  await withEnv({ DAYMARK_PASSCODE: '4821' }, async () => {
    pass = (await unlock(from('203.0.113.4'), '4821')).pass;
  });
  await withEnv({ DAYMARK_PASSCODE: '7302' }, async () => {
    assert.equal(await requestAccess(from('203.0.113.4', pass)), 'locked');
  });
});

test('DAYMARK_UNLOCK_HOURS=0 keeps the pass only for this visit', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821', DAYMARK_UNLOCK_HOURS: '0' }, async () => {
    const result = await unlock(from('203.0.113.5'), '4821');
    assert.equal(result.access, 'open');
    assert.equal(result.persist, false);
  });
});

test('five wrong tries from one address shut it out, even with the right digits', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821' }, async () => {
    const ip = '203.0.113.6';
    for (const guess of ['0000', '1111', '2222', '3333']) {
      assert.equal((await unlock(from(ip), guess)).access, 'locked');
    }
    assert.equal((await unlock(from(ip), '4444')).access, 'throttled');
    assert.equal((await unlock(from(ip), '4821')).access, 'throttled');
    assert.equal((await unlock(from('203.0.113.7'), '4821')).access, 'open');
  });
});

test('syncing without a pass never counts as a wrong try', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821' }, async () => {
    const ip = '203.0.113.8';
    for (let i = 0; i < 10; i += 1) assert.equal(await requestAccess(from(ip)), 'locked');
    assert.equal((await unlock(from(ip), '4821')).access, 'open');
  });
});

test('Vercel without a database has no shared list, and this computer is open', async () => {
  await withEnv({ VERCEL: '1' }, async () => assert.equal(await requestAccess(from('203.0.113.9')), 'off'));
  await withEnv({}, async () => assert.equal(await requestAccess(from('203.0.113.9')), 'open'));
});
