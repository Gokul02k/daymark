import { NextResponse } from 'next/server';
import { requestAccess } from '../../lib/access';
import { mergeBoards, normalizeBoard, validZone } from '../../lib/board';
import { readBoard, writeBoard } from '../../lib/boardStore';
import { publicOrigin, scheduleWakeUps } from '../../lib/schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS = { locked: 401, throttled: 429, error: 503 };

function denied(access) {
  return NextResponse.json({ synced: false, reason: access, board: null }, { status: STATUS[access] || 200 });
}

export async function GET(request) {
  const { access, user } = await requestAccess(request);
  if (access !== 'open') return denied(access);
  try {
    const board = await readBoard(user);
    return NextResponse.json({ synced: true, user, board: board ? normalizeBoard(board) : null });
  } catch (err) {
    return NextResponse.json({ synced: false, reason: 'error', board: null, error: err.message }, { status: 503 });
  }
}

export async function PUT(request) {
  const { access, user } = await requestAccess(request);
  if (access !== 'open') return denied(access);
  let board;
  try {
    const body = await request.json();
    const incoming = normalizeBoard(body.board);
    const current = await readBoard(user);
    board = current ? mergeBoards(current, incoming) : incoming;
    board.updatedAt = new Date().toISOString();
    await writeBoard(user, board);
  } catch (err) {
    return NextResponse.json({ synced: false, reason: 'error', error: err.message || 'Could not save' }, { status: 400 });
  }
  try {
    await scheduleWakeUps(user, board, publicOrigin(request), validZone(request.headers.get('x-daymark-zone')));
  } catch (err) {
    console.error('Daymark could not schedule reminders', err.message);
  }
  return NextResponse.json({ synced: true, user, board });
}
