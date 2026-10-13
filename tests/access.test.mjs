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

function withEnv(values, fn) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    fn();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function ask(passcode) {
  const headers = passcode === undefined ? {} : { 'x-daymark-passcode': encodeURIComponent(passcode) };
  return { headers: new Headers(headers) };
}

const KV = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'token' };

test('a connected database stays shut until a passcode is set and given', () => {
  withEnv(KV, () => assert.equal(requestAccess(ask('anything')), 'unset'));
  withEnv({ ...KV, DAYMARK_PASSCODE: 'blue river 7' }, () => {
    assert.equal(requestAccess(ask()), 'locked');
    assert.equal(requestAccess(ask('blue river')), 'locked');
    assert.equal(requestAccess(ask('blue river 7')), 'open');
  });
});

test('Vercel without a database has no shared list, and this computer is open', () => {
  withEnv({ VERCEL: '1' }, () => assert.equal(requestAccess(ask()), 'off'));
  withEnv({}, () => assert.equal(requestAccess(ask()), 'open'));
  withEnv({ DAYMARK_PASSCODE: 'local' }, () => assert.equal(requestAccess(ask()), 'locked'));
});
