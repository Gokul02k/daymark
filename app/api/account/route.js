import { NextResponse } from 'next/server';
import { accountInfo, requestAccess, signIn, signUp } from '../../lib/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS = { wrong: 401, invite: 403, closed: 403, taken: 409, username: 400, password: 400, throttled: 429, error: 503 };

/** Whether accounts are on, how sign-up works, and who this device is signed in as. */
export async function GET(request) {
  const { access, user } = await requestAccess(request);
  return NextResponse.json({ ...accountInfo(), user: access === 'open' ? user : null });
}

/** `{ action: 'signin' | 'signup', username, password, invite }` */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const fields = {
    username: typeof body.username === 'string' ? body.username : '',
    password: typeof body.password === 'string' ? body.password : '',
    invite: typeof body.invite === 'string' ? body.invite : '',
  };
  const result = body.action === 'signup' ? await signUp(request, fields) : await signIn(request, fields);
  if (result.access !== 'open') {
    return NextResponse.json({ signedIn: false, reason: result.access }, { status: STATUS[result.access] || 200 });
  }
  return NextResponse.json({
    signedIn: true,
    user: result.user,
    created: Boolean(result.created),
    pass: result.pass,
    expiresAt: result.expiresAt,
    persist: result.persist !== false,
  });
}
