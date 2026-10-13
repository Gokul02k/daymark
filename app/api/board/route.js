import { NextResponse } from 'next/server';
import { mergeBoards, normalizeBoard } from '../../lib/board';
import { readBoard, writeBoard } from '../../lib/boardStore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const board = await readBoard();
    return NextResponse.json({ synced: true, board: board ? normalizeBoard(board) : null });
  } catch (err) {
    if (err.code === 'NO_STORE') return NextResponse.json({ synced: false, board: null });
    return NextResponse.json({ synced: false, board: null, error: err.message }, { status: 503 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const incoming = normalizeBoard(body.board);
    const current = await readBoard();
    const board = current ? mergeBoards(current, incoming) : incoming;
    board.updatedAt = new Date().toISOString();
    await writeBoard(board);
    return NextResponse.json({ synced: true, board });
  } catch (err) {
    if (err.code === 'NO_STORE') {
      return NextResponse.json({ synced: false, error: err.message }, { status: 503 });
    }
    return NextResponse.json({ synced: false, error: err.message || 'Could not save' }, { status: 400 });
  }
}
