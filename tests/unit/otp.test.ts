import { describe, expect, it } from 'vitest';
import {
  OTP_POLICY,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  otpExpiryDate,
  isOtpExpired,
  isAttemptCapExceeded,
  isResendCooldownActive,
  isDailyCapExceeded,
} from '@/features/checkout/domain/otp';

describe('generateOtpCode', () => {
  it('generates a code of the policy length, numeric only', () => {
    const code = generateOtpCode();
    expect(code).toHaveLength(OTP_POLICY.codeLength);
    expect(code).toMatch(/^\d+$/);
  });

  it('zero-pads short codes to the full length', () => {
    // Statistically likely to hit a leading-zero code across many draws.
    const codes = Array.from({ length: 200 }, () => generateOtpCode());
    expect(codes.every((c) => c.length === OTP_POLICY.codeLength)).toBe(true);
  });
});

describe('hashOtpCode / verifyOtpCode', () => {
  it('verifies the correct code against its hash', () => {
    const code = '123456';
    const stored = hashOtpCode(code);
    expect(verifyOtpCode(code, stored)).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const stored = hashOtpCode('123456');
    expect(verifyOtpCode('654321', stored)).toBe(false);
  });

  it('never stores the code in plaintext', () => {
    const code = '123456';
    const stored = hashOtpCode(code);
    expect(stored).not.toContain(code);
  });

  it('produces different stored values for the same code (salted)', () => {
    const a = hashOtpCode('123456');
    const b = hashOtpCode('123456');
    expect(a).not.toBe(b);
  });
});

describe('otpExpiryDate / isOtpExpired', () => {
  it('sets expiry policy.expiryMinutes from now', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiry = otpExpiryDate(now);
    expect(expiry.getTime() - now.getTime()).toBe(OTP_POLICY.expiryMinutes * 60_000);
  });

  it('is not expired before the expiry time', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiry = otpExpiryDate(now);
    expect(isOtpExpired(expiry, new Date(now.getTime() + 60_000))).toBe(false);
  });

  it('is expired after the expiry time', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiry = otpExpiryDate(now);
    const after = new Date(expiry.getTime() + 1000);
    expect(isOtpExpired(expiry, after)).toBe(true);
  });
});

describe('isAttemptCapExceeded', () => {
  it('is false under the cap', () => {
    expect(isAttemptCapExceeded(OTP_POLICY.maxAttempts - 1)).toBe(false);
  });

  it('is true at or above the cap', () => {
    expect(isAttemptCapExceeded(OTP_POLICY.maxAttempts)).toBe(true);
  });
});

describe('isResendCooldownActive', () => {
  it('is false when no code has ever been sent', () => {
    expect(isResendCooldownActive(null)).toBe(false);
  });

  it('is true immediately after sending', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isResendCooldownActive(now, now)).toBe(true);
  });

  it('is false once the cooldown has elapsed', () => {
    const sentAt = new Date('2026-01-01T00:00:00Z');
    const later = new Date(sentAt.getTime() + (OTP_POLICY.resendCooldownSeconds + 1) * 1000);
    expect(isResendCooldownActive(sentAt, later)).toBe(false);
  });
});

describe('isDailyCapExceeded', () => {
  it('is false with no window started', () => {
    expect(isDailyCapExceeded(0, null)).toBe(false);
  });

  it('is true at the cap within the window', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z');
    const now = new Date(windowStart.getTime() + 60_000);
    expect(isDailyCapExceeded(OTP_POLICY.dailySendCap, windowStart, now)).toBe(true);
  });

  it('is false once the window has rolled over (>=24h)', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z');
    const nextDay = new Date(windowStart.getTime() + 24 * 3_600_000 + 1);
    expect(isDailyCapExceeded(OTP_POLICY.dailySendCap, windowStart, nextDay)).toBe(false);
  });
});
