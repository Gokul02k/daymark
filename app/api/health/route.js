import { proxy } from '../../lib/proxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  return proxy('/health');
}
