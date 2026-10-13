import { proxy } from '../../../../lib/proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function POST(_request, { params }) {
  return proxy(`/tasks/${params.id}/uncheck`, { method: 'POST', body: {} });
}
