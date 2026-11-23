import { proxy } from '../../lib/proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request) {
  return proxy(request, '/lists');
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return proxy(request, '/lists', { method: 'POST', body });
}
