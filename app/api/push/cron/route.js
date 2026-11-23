import { NextResponse } from 'next/server';
import {
  dailyDigest,
  dayInZone,
  dueDigestTimes,
  markDigest,
  mergeBoards,
  normalizeBoard,
  reminderInstant,
  reminderKey,
  reminderMessage,
  remindersDue,
  remindersForDay,
  updateTask,
} from '../../../lib/board';
import { listUsers, readBoard, storeMode, writeBoard } from '../../../lib/boardStore';
import { readDevices, removeDevice, sendReminder, vapidKeys } from '../../../lib/push';
import { exactReminders, publicOrigin, scheduleWakeUps } from '../../../lib/schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// QStash can call a moment before this server's clock reaches the reminder.
const EARLY_MS = 60 * 1000;

async function run(request) {
  const secret = process.env.CRON_SECRET;
  // On Vercel the job can send notifications to everyone, so it never runs without its secret.
  if (!secret && process.env.VERCEL) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 503 });
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (storeMode() === 'off') return NextResponse.json({ sent: 0, reason: 'off' });

  const origin = publicOrigin(request);
  let sent = 0;
  let tasks = 0;
  let keys = null;
  const getKeys = async () => {
    keys = keys || (await vapidKeys());
    return keys;
  };
  for (const user of await listUsers()) {
    try {
      const result = await runFor(user, origin, getKeys);
      sent += result.sent;
      tasks += result.tasks;
    } catch (err) {
      console.error('Daymark reminders failed for one account', err.message);
    }
  }
  return NextResponse.json({ sent, tasks });
}

async function runFor(user, origin, getKeys) {
  const raw = await readBoard(user);
  if (!raw) return { sent: 0, tasks: 0 };
  const board = normalizeBoard(raw);
  const devices = await readDevices(user);
  const exact = exactReminders();
  const now = Date.now() + EARLY_MS;
  const reminded = new Map();
  let sent = 0;
  let digestMark = null;

  if (devices.length > 0) {
    const keys = await getKeys();
    for (const device of devices) {
      const zone = device.timeZone;
      const today = dayInZone(zone);
      const due = exact ? remindersDue(board, now, zone) : remindersForDay(board, today);
      const dueTimes = dueDigestTimes(board, new Date(now), zone);
      const digest = dueTimes.length > 0 ? dailyDigest(board, today) : null;
      if (dueTimes.length > 0) digestMark = { today, times: dueTimes };
      if (due.length === 0 && !digest) continue;
      try {
        if (due.length > 0) {
          await sendReminder(keys, device, reminderMessage(due, today));
          sent += 1;
          for (const task of due) {
            if (reminderInstant(task, zone) <= now) reminded.set(task.id, reminderKey(task));
          }
        }
        if (digest) {
          await sendReminder(keys, device, digest);
          sent += 1;
        }
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await removeDevice(user, device.endpoint);
        else console.error('Daymark reminder failed', err.statusCode || '', err.body || err.message);
      }
    }
  }

  let latest = board;
  if (reminded.size > 0 || digestMark) {
    let next = board;
    for (const [id, key] of reminded) next = updateTask(next, id, { remindedOn: key });
    if (digestMark) next = markDigest(next, digestMark.today, digestMark.times);
    const stored = await readBoard(user);
    latest = stored ? mergeBoards(stored, next) : next;
    await writeBoard(user, latest);
  }
  try {
    await scheduleWakeUps(user, latest, origin, devices[0]?.timeZone);
  } catch (err) {
    console.error('Daymark could not schedule reminders', err.message);
  }
  return { sent, tasks: reminded.size };
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
