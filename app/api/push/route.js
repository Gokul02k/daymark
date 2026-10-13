import { NextResponse } from 'next/server';
import { requestAccess } from '../../lib/access';
import { validZone } from '../../lib/board';
import { cleanSubscription, saveDevice, vapidKeys } from '../../lib/push';
import { exactReminders } from '../../lib/schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS = { locked: 401, throttled: 429 };

export async function GET(request) {
  const access = await requestAccess(request);
  if (access !== 'open') return NextResponse.json({ enabled: false, reason: access });
  try {
    const keys = await vapidKeys();
    return NextResponse.json({ enabled: true, exact: exactReminders(), publicKey: keys.publicKey });
  } catch {
    return NextResponse.json({ enabled: false, reason: 'error' }, { status: 503 });
  }
}

export async function POST(request) {
  const access = await requestAccess(request);
  if (access !== 'open') {
    return NextResponse.json({ saved: false, reason: access }, { status: STATUS[access] || 503 });
  }
  const body = await request.json().catch(() => ({}));
  const subscription = cleanSubscription(body.subscription);
  if (!subscription) return NextResponse.json({ saved: false, reason: 'bad subscription' }, { status: 400 });
  try {
    await saveDevice(subscription, validZone(body.timeZone) || 'UTC');
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ saved: false, reason: 'error' }, { status: 503 });
  }
}
