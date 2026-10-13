import { NextResponse } from 'next/server';
import { requestAccess } from '../../lib/access';
import { mergeBoards, normalizeBoard } from '../../lib/board';
import { readBoard, writeBoard } from '../../lib/boardStore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function denied(access) {
  return NextResponse.json({ synced: false, reason: access, board: null }, { status: access === 'locked' ? 401 : 200 });
}

export async function GET(request) {
  const access = requestAccess(request);
  if (access !== 'open') return denied(access);
  try {
    const board = await readBoard();
    return NextResponse.json({ synced: true, board: board ? normalizeBoard(board) : null });
  } catch (err) {
    return NextResponse.json({ synced: false, reason: 'error', board: null, error: err.message }, { status: 503 });
  }
}

export async function PUT(request) {
  const access = requestAccess(request);
  if (access !== 'open') return denied(access);
  try {
    const body = await request.json();
    const incoming = normalizeBoard(body.board);
    const current = await readBoard();
    const board = current ? mergeBoards(current, incoming) : incoming;
    board.updatedAt = new Date().toISOString();
    await writeBoard(board);
    return NextResponse.json({ synced: true, board });
  } catch (err) {
    return NextResponse.json({ synced: false, reason: 'error', error: err.message || 'Could not save' }, { status: 400 });
  }
}
