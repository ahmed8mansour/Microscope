import 'server-only';

import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  generateOtpCode,
  hashOtpCode,
  isAttemptCapExceeded,
  isDailyCapExceeded,
  isOtpExpired,
  isResendCooldownActive,
  otpExpiryDate,
  OTP_POLICY,
  verifyOtpCode,
} from '../domain/otp';
import { contactSchema } from '../schemas/checkout.schema';
import type { User, UserRow } from '../types/checkout.types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'NotFoundError';
  }
}

// Resend cooldown or per-email daily cap hit (FR-008).
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Wrong code, expired code, or no active code to check against (FR-007).
export class InvalidCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCodeError';
  }
}

// Verification attempts exhausted for the current code (FR-007).
export class AttemptsExceededError extends Error {
  constructor() {
    super('Maximum verification attempts exceeded; request a new code');
    this.name = 'AttemptsExceededError';
  }
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    whatsapp: row.whatsapp,
    verified: row.verified,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const UNIQUE_VIOLATION = '23505';

function pgCode(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return undefined;
  if ('code' in err) return (err as { code?: unknown }).code;
  // drizzle-orm wraps the raw postgres error in a DrizzleQueryError; the
  // pg error code lives on `.cause`, not the top-level object.
  if ('cause' in err) return pgCode((err as { cause?: unknown }).cause);
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === UNIQUE_VIOLATION;
}

async function findUserRowByEmail(email: string): Promise<UserRow | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return row;
}

async function requireUserRow(userId: string): Promise<UserRow> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new NotFoundError(userId);
  return row;
}

// FR-004. Reuses the existing record for the email (case-insensitive) or
// creates a new one with verified=false. Concurrency-safe: a race on the
// same email resolves to the single row via the unique index.
export async function createOrFindUser(email: string, whatsapp: string): Promise<User> {
  const parsed = contactSchema.safeParse({ email, whatsapp });
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const existing = await findUserRowByEmail(parsed.data.email);
  if (existing) return toUser(existing);

  try {
    const [row] = await db
      .insert(users)
      .values({ email: parsed.data.email, whatsapp: parsed.data.whatsapp })
      .returning();
    return toUser(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const row = await findUserRowByEmail(parsed.data.email);
      if (row) return toUser(row);
    }
    throw err;
  }
}

// FR-005, FR-006, FR-008. Generates and stores a hashed code, enforcing the
// resend cooldown and per-email daily cap. Returns the plaintext code so the
// caller can email it — it is never persisted or returned from any other
// method.
export async function issueOtp(userId: string): Promise<{ user: User; code: string }> {
  const current = await requireUserRow(userId);
  const now = new Date();

  if (isResendCooldownActive(current.otpLastSentAt, now)) {
    throw new RateLimitError('Please wait before requesting another code');
  }

  // Roll the daily send window over if it has expired (>=24h old).
  let windowStart = current.otpSendWindowStart;
  let sendCount = current.otpSendCount;
  if (!windowStart || now.getTime() - windowStart.getTime() >= 24 * 3_600_000) {
    windowStart = now;
    sendCount = 0;
  }

  if (isDailyCapExceeded(sendCount, windowStart, now)) {
    throw new RateLimitError('Daily verification code limit reached for this email');
  }

  const code = generateOtpCode();
  const [row] = await db
    .update(users)
    .set({
      otpCodeHash: hashOtpCode(code),
      otpExpiresAt: otpExpiryDate(now),
      otpAttemptCount: 0,
      otpLastSentAt: now,
      otpSendCount: sendCount + 1,
      otpSendWindowStart: windowStart,
      // Issuing a new code starts a fresh checkout — invalidate any prior
      // verification so each purchase must re-verify (spec Session 2026-08-04).
      verified: false,
      verifiedAt: null,
    })
    .where(eq(users.id, userId))
    .returning();

  return { user: toUser(row), code };
}

// FR-007, FR-007a. Verifies a submitted code and, on success, sets
// verified=true, stamps verifiedAt, and clears the OTP fields.
//
// NOTE: there is deliberately no "already verified → success" short-circuit.
// Verification is per-checkout (spec Session 2026-08-04): a returning customer
// gets a fresh code from issueOtp (which resets verified=false), so this always
// checks a real, current code. The old short-circuit both defeated per-purchase
// OTP and returned success for a WRONG code once a user had ever verified.
export async function verifyOtp(userId: string, code: string): Promise<User> {
  const current = await requireUserRow(userId);

  if (!current.otpCodeHash || !current.otpExpiresAt) {
    throw new InvalidCodeError('No active verification code; request a new one');
  }

  if (isAttemptCapExceeded(current.otpAttemptCount)) {
    throw new AttemptsExceededError();
  }

  if (isOtpExpired(current.otpExpiresAt)) {
    throw new InvalidCodeError('Verification code has expired; request a new one');
  }

  if (!verifyOtpCode(code, current.otpCodeHash)) {
    await db
      .update(users)
      .set({ otpAttemptCount: current.otpAttemptCount + 1 })
      .where(eq(users.id, userId));
    throw new InvalidCodeError('Incorrect verification code');
  }

  const [row] = await db
    .update(users)
    .set({
      verified: true,
      verifiedAt: new Date(),
      otpCodeHash: null,
      otpExpiresAt: null,
      otpAttemptCount: 0,
    })
    .where(eq(users.id, userId))
    .returning();

  return toUser(row);
}

// Atomically authorize ONE payment-intent creation: the update succeeds only
// if the user is currently verified AND that verification is still fresh, and
// it consumes the verification in the same statement (verified=false). Doing
// the check and the consume as a single conditional UPDATE makes it race-safe
// — two concurrent create-intent calls cannot both pass (spec Session
// 2026-08-04). Returns true iff a fresh verification was consumed.
export async function consumeFreshVerification(userId: string): Promise<boolean> {
  const freshCutoff = new Date(
    Date.now() - OTP_POLICY.verificationFreshnessMinutes * 60_000
  );
  const rows = await db
    .update(users)
    .set({ verified: false, verifiedAt: null })
    .where(
      // `gt(verifiedAt, cutoff)` is NULL (not true) when verifiedAt is null, so
      // an unverified/never-verified row can't match — no explicit null check
      // needed.
      and(eq(users.id, userId), eq(users.verified, true), gt(users.verifiedAt, freshCutoff))
    )
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const row = await findUserRowByEmail(email);
  return row ? toUser(row) : null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ? toUser(row) : null;
}

// FR-013 (relocated from 001), SC-007. Clears contact PII, leaves the
// (persistent, passwordless) record's identity and verified state intact.
export async function anonymizePii(userId: string): Promise<User> {
  await requireUserRow(userId);
  const [row] = await db
    .update(users)
    .set({ email: null, whatsapp: null })
    .where(eq(users.id, userId))
    .returning();
  return toUser(row);
}
