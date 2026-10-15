import { NextResponse } from 'next/server';
import {
  dailyDigest,
  dayInZone,
  digestDue,
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
import { readBoard, storeMode, writeBoard } from '../../../lib/boardStore';
import { readDevices, removeDevice, sendReminder, vapidKeys } from '../../../lib/push';
import { exactReminders, publicOrigin, scheduleWakeUps } from '../../../lib/schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// QStash can call a moment before this server's clock reaches the reminder.
const EARLY_MS = 60 * 1000;

async function run(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (storeMode() === 'off') return NextResponse.json({ sent: 0, reason: 'off' });

  const raw = await readBoard();
  if (!raw) return NextResponse.json({ sent: 0 });
  const board = normalizeBoard(raw);
  const devices = await readDevices();
  const exact = exactReminders();
  const now = Date.now() + EARLY_MS;
  const reminded = new Map();
  let sent = 0;
  let digestDay = null;

  if (devices.length > 0) {
    const keys = await vapidKeys();
    for (const device of devices) {
      const zone = device.timeZone;
      const today = dayInZone(zone);
      const due = exact ? remindersDue(board, now, zone) : remindersForDay(board, today);
      const digest = digestDue(board, new Date(now), zone) ? dailyDigest(board, today) : null;
      if (digestDue(board, new Date(now), zone)) digestDay = today;
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
        if (err.statusCode === 404 || err.statusCode === 410) await removeDevice(device.endpoint);
        else console.error('Daymark reminder failed', err.statusCode || '', err.body || err.message);
      }
    }
  }

  let latest = board;
  if (reminded.size > 0 || digestDay) {
    let next = board;
    for (const [id, key] of reminded) next = updateTask(next, id, { remindedOn: key });
    if (digestDay) next = markDigest(next, digestDay);
    const stored = await readBoard();
    latest = stored ? mergeBoards(stored, next) : next;
    await writeBoard(latest);
  }
  try {
    await scheduleWakeUps(latest, publicOrigin(request), devices[0]?.timeZone);
  } catch (err) {
    console.error('Daymark could not schedule reminders', err.message);
  }
  return NextResponse.json({ sent, tasks: reminded.size });
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
