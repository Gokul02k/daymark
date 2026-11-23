import { NextResponse } from 'next/server';
import { requestAccess } from './access';
import { engineFetch } from './engineClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Passes a request on to the local engine, but only for someone signed in when accounts are on. */
export async function proxy(request, path, init) {
  const { access } = await requestAccess(request);
  if (access !== 'open' && access !== 'off') {
    return NextResponse.json({ error: 'sign in first' }, { status: access === 'error' ? 503 : 401 });
  }
  try {
    return NextResponse.json(await engineFetch(path, init));
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'engine unavailable' },
      { status: err.status || 503 },
    );
  }
}
