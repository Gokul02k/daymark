import { createHash, timingSafeEqual } from 'crypto';
import { storeMode } from './boardStore.js';

/**
 * 'open' lets the request through, 'locked' means the passcode is missing or wrong,
 * 'unset' means a database is connected but DAYMARK_PASSCODE is not, and 'off' means
 * there is no shared store at all.
 */
export function requestAccess(request) {
  const mode = storeMode();
  if (mode === 'off') return 'off';
  const expected = process.env.DAYMARK_PASSCODE || '';
  if (!expected) return mode === 'redis' ? 'unset' : 'open';
  return matches(givenPasscode(request), expected) ? 'open' : 'locked';
}

function givenPasscode(request) {
  const raw = request.headers.get('x-daymark-passcode') || '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

function matches(given, expected) {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
