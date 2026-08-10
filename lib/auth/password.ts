import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

// Login route only (Node runtime) — never called from Edge middleware.
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

// Constant-time compare against ADMIN_PASSWORD (FR-005: the gate must not
// reveal how close a submitted password is). Hashing first normalizes both
// operands to a fixed length so `timingSafeEqual` never throws on a length
// mismatch, which would itself be a timing/branching side channel.
export function verifyPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error('ADMIN_PASSWORD must be set (see .env.example).');
  }
  return timingSafeEqual(digest(candidate), digest(expected));
}
