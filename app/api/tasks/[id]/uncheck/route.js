import { proxy } from '../../../../lib/proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function POST(request, { params }) {
  return proxy(request, `/tasks/${params.id}/uncheck`, { method: 'POST', body: {} });
}
