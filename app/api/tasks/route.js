import { proxy } from '../../lib/proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  return proxy(qs ? `/tasks?${qs}` : '/tasks');
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return proxy('/tasks', { method: 'POST', body });
}
