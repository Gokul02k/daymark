import { cleanTime, nextDigestAt, reminderInstant, reminderKey } from './board.js';
import { readJson, writeJson } from './boardStore.js';

const QSTASH_MAX_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

export function exactReminders() {
  return Boolean(process.env.QSTASH_TOKEN);
}

export function publicOrigin(request) {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : new URL(request.url).origin;
}

/** Asks QStash to call the reminder job at each reminder's moment, once per task and time. */
export async function scheduleWakeUps(board, origin, fallbackZone) {
  if (!exactReminders()) return;
  const now = Date.now();
  const booked = (await readJson('scheduled')) || {};
  const keep = {};
  const wanted = new Map();
  for (const task of board.tasks) {
    if (!task.remind || task.done || !task.dueAt) continue;
    const key = reminderKey(task);
    if (task.remindedOn === key) continue;
    if (booked[task.id] === key) {
      keep[task.id] = key;
      continue;
    }
    const at = reminderInstant(task, fallbackZone);
    if (at <= now || at - now > QSTASH_MAX_DELAY_MS) continue;
    if (!wanted.has(at)) wanted.set(at, []);
    wanted.get(at).push([task.id, key]);
  }
  for (const [at, tasks] of wanted) {
    try {
      await wakeAt(origin, at);
      for (const [id, key] of tasks) keep[id] = key;
    } catch (err) {
      console.error('Daymark could not schedule a reminder', err.message);
    }
  }
  const digestAt = cleanTime(board.notifyAt);
  if (digestAt && fallbackZone) {
    const at = nextDigestAt(digestAt, fallbackZone, now);
    const key = at ? `digest ${digestAt} ${at}` : '';
    if (key && booked.digest === key) keep.digest = key;
    else if (key && at - now <= QSTASH_MAX_DELAY_MS) {
      try {
        await wakeAt(origin, at);
        keep.digest = key;
      } catch (err) {
        console.error('Daymark could not schedule the daily notification', err.message);
      }
    }
  }
  if (JSON.stringify(keep) !== JSON.stringify(booked)) await writeJson('scheduled', keep);
}

async function wakeAt(origin, at) {
  const base = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');
  const headers = {
    Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
    'Upstash-Not-Before': String(Math.ceil(at / 1000)),
  };
  if (process.env.CRON_SECRET) headers['Upstash-Forward-Authorization'] = `Bearer ${process.env.CRON_SECRET}`;
  const res = await fetch(`${base}/v2/publish/${origin}/api/push/cron`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`QStash answered ${res.status}`);
}
