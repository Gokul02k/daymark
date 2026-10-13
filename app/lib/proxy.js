import { NextResponse } from 'next/server';
import { engineFetch } from './engineClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function proxy(path, init) {
  try {
    return NextResponse.json(await engineFetch(path, init));
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'engine unavailable' },
      { status: err.status || 503 },
    );
  }
}
