import { NextResponse } from 'next/server';
import { dayInZone, mergeBoards, normalizeBoard, reminderMessage, remindersDue, updateTask } from '../../../lib/board';
import { readBoard, storeMode, writeBoard } from '../../../lib/boardStore';
import { readDevices, removeDevice, sendReminder, vapidKeys } from '../../../lib/push';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (storeMode() === 'off') return NextResponse.json({ sent: 0, reason: 'off' });

  const raw = await readBoard();
  const devices = await readDevices();
  if (!raw || devices.length === 0) return NextResponse.json({ sent: 0 });

  const board = normalizeBoard(raw);
  const keys = await vapidKeys();
  const reminded = new Map();
  let sent = 0;
  for (const device of devices) {
    const today = dayInZone(device.timeZone);
    // The job runs once a day, so a task due today counts whatever the local hour is.
    const due = remindersDue(board, today, 23);
    if (due.length === 0) continue;
    try {
      await sendReminder(keys, device, reminderMessage(due, today));
      sent += 1;
      for (const task of due) reminded.set(task.id, task.dueAt);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await removeDevice(device.endpoint);
      else console.error('Daymark reminder failed', err.statusCode || '', err.body || err.message);
    }
  }

  if (reminded.size > 0) {
    let next = board;
    for (const [id, dueAt] of reminded) next = updateTask(next, id, { remindedOn: dueAt });
    const latest = await readBoard();
    await writeBoard(latest ? mergeBoards(latest, next) : next);
  }
  return NextResponse.json({ sent, tasks: reminded.size });
}
