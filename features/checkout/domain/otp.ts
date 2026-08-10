import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Clarified policy (spec Session 2026-08-02): 6-digit numeric code, 10-minute
// expiry, 5 attempts per code, 60-second resend cooldown, per-email daily cap.
export const OTP_POLICY = {
  codeLength: 6,
  expiryMinutes: 10,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  dailySendCap: 10,
  // How long an OTP verification authorizes payment. Verification is
  // per-checkout: it is reset when a new code is issued and consumed on
  // payment-intent creation, so each purchase needs its own OTP. This window
  // just bounds how long a verified customer has to finish paying before the
  // verification goes stale (spec Session 2026-08-04). Enforced atomically in
  // consumeFreshVerification (SQL), so the window value lives here as the
  // single source of truth.
  verificationFreshnessMinutes: 15,
} as const;

// Numeric, zero-padded to codeLength (FR-005).
export function generateOtpCode(): string {
  const max = 10 ** OTP_POLICY.codeLength;
  return randomInt(0, max).toString().padStart(OTP_POLICY.codeLength, '0');
}

// Salted hash — the code is never stored in a recoverable/plaintext form
// (FR-006). Stored as "salt:hash".
export function hashOtpCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(`${salt}:${code}`).digest('hex');
  return `${salt}:${hash}`;
}

// Constant-time comparison against a stored "salt:hash" value.
export function verifyOtpCode(code: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = createHash('sha256').update(`${salt}:${code}`).digest('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function otpExpiryDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_POLICY.expiryMinutes * 60_000);
}

export function isOtpExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() > expiresAt.getTime();
}

export function isAttemptCapExceeded(attemptCount: number): boolean {
  return attemptCount >= OTP_POLICY.maxAttempts;
}

export function isResendCooldownActive(
  lastSentAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!lastSentAt) return false;
  const elapsedSeconds = (now.getTime() - lastSentAt.getTime()) / 1000;
  return elapsedSeconds < OTP_POLICY.resendCooldownSeconds;
}

// The daily send window rolls over 24h after it started; sendCount resets
// with it (checked by the caller, not this predicate).
export function isDailyCapExceeded(
  sendCount: number,
  windowStart: Date | null,
  now: Date = new Date()
): boolean {
  if (!windowStart) return false;
  const windowAgeHours = (now.getTime() - windowStart.getTime()) / 3_600_000;
  if (windowAgeHours >= 24) return false;
  return sendCount >= OTP_POLICY.dailySendCap;
}
