import { proxy } from '../../lib/proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request) {
  return proxy(request, '/health');
}
