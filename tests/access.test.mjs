import assert from 'node:assert/strict';
import test from 'node:test';
import { requestAccess } from '../app/lib/access.js';

const KEYS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'VERCEL',
  'DAYMARK_PASSCODE',
];

async function withEnv(values, fn) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    await fn();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function ask(passcode, ip = '203.0.113.1') {
  const headers = { 'x-real-ip': ip };
  if (passcode !== undefined) headers['x-daymark-passcode'] = encodeURIComponent(passcode);
  return { headers: new Headers(headers) };
}

const KV = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'token' };

test('a connected database stays shut until a four-digit passcode is set', async () => {
  await withEnv(KV, async () => assert.equal(await requestAccess(ask('1234')), 'unset'));
  await withEnv({ ...KV, DAYMARK_PASSCODE: 'blue river 7' }, async () => {
    assert.equal(await requestAccess(ask('blue river 7')), 'unset');
  });
  await withEnv({ ...KV, DAYMARK_PASSCODE: '4821' }, async () => {
    assert.equal(await requestAccess(ask()), 'locked');
  });
});

test('the right four digits open the list', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821' }, async () => {
    assert.equal(await requestAccess(ask('4821', '203.0.113.2')), 'open');
    assert.equal(await requestAccess(ask('4820', '203.0.113.2')), 'locked');
  });
});

test('five wrong tries from one address shut it out, even with the right digits', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821' }, async () => {
    const ip = '203.0.113.3';
    for (const guess of ['0000', '1111', '2222', '3333']) {
      assert.equal(await requestAccess(ask(guess, ip)), 'locked');
    }
    assert.equal(await requestAccess(ask('4444', ip)), 'throttled');
    assert.equal(await requestAccess(ask('4821', ip)), 'throttled');
    assert.equal(await requestAccess(ask('4821', '203.0.113.4')), 'open');
  });
});

test('opening the app without a passcode never counts as a wrong try', async () => {
  await withEnv({ DAYMARK_PASSCODE: '4821' }, async () => {
    const ip = '203.0.113.5';
    for (let i = 0; i < 10; i += 1) assert.equal(await requestAccess(ask(undefined, ip)), 'locked');
    assert.equal(await requestAccess(ask('4821', ip)), 'open');
  });
});

test('Vercel without a database has no shared list, and this computer is open', async () => {
  await withEnv({ VERCEL: '1' }, async () => assert.equal(await requestAccess(ask()), 'off'));
  await withEnv({}, async () => assert.equal(await requestAccess(ask()), 'open'));
});
