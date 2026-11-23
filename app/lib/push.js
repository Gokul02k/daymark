import webpush from 'web-push';
import { listUsers, readJson, readOwn, writeJson, writeOwn } from './boardStore.js';

const SUBJECT = process.env.VAPID_SUBJECT || 'https://github.com/Gokul02k/daymark';
const MAX_DEVICES = 10;

export async function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const stored = await readJson('vapid');
  if (stored?.publicKey && stored?.privateKey) return stored;
  await writeJson('vapid', webpush.generateVAPIDKeys(), { onlyIfMissing: true });
  return readJson('vapid');
}

export function cleanSubscription(raw) {
  const endpoint = raw?.endpoint;
  const p256dh = raw?.keys?.p256dh;
  const auth = raw?.keys?.auth;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 1000) return null;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

export async function readDevices(user) {
  const list = await readOwn('push', user);
  return Array.isArray(list) ? list : [];
}

/** A phone gets one person's reminders: whoever signed in on it last. */
export async function saveDevice(user, subscription, timeZone) {
  for (const other of await listUsers()) {
    if (other !== user) await removeDevice(other, subscription.endpoint);
  }
  const rest = (await readDevices(user)).filter((device) => device.endpoint !== subscription.endpoint);
  const device = { ...subscription, timeZone, savedAt: new Date().toISOString() };
  await writeOwn('push', user, [...rest, device].slice(-MAX_DEVICES));
}

export async function removeDevice(user, endpoint) {
  const list = await readDevices(user);
  const next = list.filter((device) => device.endpoint !== endpoint);
  if (next.length !== list.length) await writeOwn('push', user, next);
}

export function sendReminder(keys, device, payload) {
  return webpush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify(payload), {
    TTL: 12 * 60 * 60,
    vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
  });
}
