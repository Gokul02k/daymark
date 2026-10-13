import { NextResponse } from 'next/server';
import { unlock } from '../../lib/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS = { locked: 401, throttled: 429, error: 503 };

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const result = await unlock(request, typeof body.passcode === 'string' ? body.passcode : '');
  if (result.access !== 'open') {
    return NextResponse.json({ unlocked: false, reason: result.access }, { status: STATUS[result.access] || 200 });
  }
  return NextResponse.json({
    unlocked: true,
    pass: result.pass || null,
    expiresAt: result.expiresAt || null,
    persist: result.persist !== false,
  });
}
