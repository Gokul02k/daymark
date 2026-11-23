import { NextResponse } from 'next/server';
import { requestAccess } from '../../lib/access';
import { validZone } from '../../lib/board';
import { cleanSubscription, removeDevice, saveDevice, vapidKeys } from '../../lib/push';
import { exactReminders } from '../../lib/schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS = { locked: 401, throttled: 429 };

function denied(access) {
  return NextResponse.json({ saved: false, reason: access }, { status: STATUS[access] || 503 });
}

export async function GET(request) {
  const { access } = await requestAccess(request);
  if (access !== 'open') return NextResponse.json({ enabled: false, reason: access });
  try {
    const keys = await vapidKeys();
    return NextResponse.json({ enabled: true, exact: exactReminders(), publicKey: keys.publicKey });
  } catch {
    return NextResponse.json({ enabled: false, reason: 'error' }, { status: 503 });
  }
}

/** Signs this device up for the signed-in person's reminders, and takes it off anyone else's. */
export async function POST(request) {
  const { access, user } = await requestAccess(request);
  if (access !== 'open') return denied(access);
  const body = await request.json().catch(() => ({}));
  const subscription = cleanSubscription(body.subscription);
  if (!subscription) return NextResponse.json({ saved: false, reason: 'bad subscription' }, { status: 400 });
  try {
    await saveDevice(user, subscription, validZone(body.timeZone) || 'UTC');
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ saved: false, reason: 'error' }, { status: 503 });
  }
}

/** Signing out stops this device getting that person's reminders. */
export async function DELETE(request) {
  const { access, user } = await requestAccess(request);
  if (access !== 'open') return denied(access);
  const body = await request.json().catch(() => ({}));
  if (typeof body.endpoint !== 'string') return NextResponse.json({ saved: false }, { status: 400 });
  try {
    await removeDevice(user, body.endpoint);
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ saved: false, reason: 'error' }, { status: 503 });
  }
}
