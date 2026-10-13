import { NextResponse } from 'next/server';
import { requestAccess } from '../../lib/access';
import { cleanSubscription, saveDevice, vapidKeys } from '../../lib/push';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const access = requestAccess(request);
  if (access !== 'open') return NextResponse.json({ enabled: false, reason: access });
  try {
    const keys = await vapidKeys();
    return NextResponse.json({ enabled: true, publicKey: keys.publicKey });
  } catch {
    return NextResponse.json({ enabled: false, reason: 'error' }, { status: 503 });
  }
}

export async function POST(request) {
  const access = requestAccess(request);
  if (access !== 'open') {
    return NextResponse.json({ saved: false, reason: access }, { status: access === 'locked' ? 401 : 503 });
  }
  const body = await request.json().catch(() => ({}));
  const subscription = cleanSubscription(body.subscription);
  if (!subscription) return NextResponse.json({ saved: false, reason: 'bad subscription' }, { status: 400 });
  try {
    await saveDevice(subscription, zoneOrUtc(body.timeZone));
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ saved: false, reason: 'error' }, { status: 503 });
  }
}

function zoneOrUtc(value) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: String(value) }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}
