import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

vi.mock('@/lib/email/sendgrid', () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

describe.skipIf(!hasDb)('POST /api/checkout/verify-otp', () => {
  let db: typeof import('@/lib/db').db;
  let users: typeof import('@/lib/db/schema').users;
  let sendOtp: typeof import('@/app/api/checkout/send-otp/route').POST;
  let verifyOtp: typeof import('@/app/api/checkout/verify-otp/route').POST;
  let sendOtpEmail: ReturnType<typeof vi.fn>;
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    ({ db } = await import('@/lib/db'));
    ({ users } = await import('@/lib/db/schema'));
    ({ POST: sendOtp } = await import('@/app/api/checkout/send-otp/route'));
    ({ POST: verifyOtp } = await import('@/app/api/checkout/verify-otp/route'));
    ({ sendOtpEmail } = (await import('@/lib/email/sendgrid')) as unknown as {
      sendOtpEmail: ReturnType<typeof vi.fn>;
    });
    sendOtpEmail.mockClear();
  });

  afterAll(async () => {
    if (!hasDb || createdUserIds.length === 0) return;
    const { inArray } = await import('drizzle-orm');
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  function sendReq(body: unknown) {
    return new Request('http://localhost/api/checkout/send-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function verifyReq(body: unknown) {
    return new Request('http://localhost/api/checkout/verify-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function findUser(email: string) {
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  async function issueAndCapture(email: string) {
    const res = await sendOtp(sendReq({ email, whatsapp: '+15551234567' }));
    expect(res.status).toBe(200);
    const user = await findUser(email);
    createdUserIds.push(user.id);
    const code = sendOtpEmail.mock.calls.at(-1)?.[1] as string;
    return { user, code };
  }

  it('sets verified=true for the correct code', async () => {
    const email = `verify-${Date.now()}-${Math.random()}@example.com`;
    const { code } = await issueAndCapture(email);

    const res = await verifyOtp(verifyReq({ email, code }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ verified: true });

    const user = await findUser(email);
    expect(user.verified).toBe(true);
    expect(user.otpCodeHash).toBeNull();
  });

  it('rejects a wrong code with 401 and increments the attempt count', async () => {
    const email = `wrong-${Date.now()}-${Math.random()}@example.com`;
    const { code, user: before } = await issueAndCapture(email);
    const wrong = code === '000000' ? '111111' : '000000';

    const res = await verifyOtp(verifyReq({ email, code: wrong }));
    expect(res.status).toBe(401);

    const after = await findUser(email);
    expect(after.verified).toBe(false);
    expect(after.otpAttemptCount).toBe(before.otpAttemptCount + 1);
  });

  it('rejects an expired code with 401', async () => {
    const email = `expired-${Date.now()}-${Math.random()}@example.com`;
    const { code, user } = await issueAndCapture(email);

    const { eq } = await import('drizzle-orm');
    await db
      .update(users)
      .set({ otpExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(users.id, user.id));

    const res = await verifyOtp(verifyReq({ email, code }));
    expect(res.status).toBe(401);
  });

  it('blocks further attempts once the attempt cap is exceeded (429)', async () => {
    const email = `cap-${Date.now()}-${Math.random()}@example.com`;
    const { code } = await issueAndCapture(email);
    const wrong = code === '000000' ? '111111' : '000000';

    // Exhaust the attempt cap with wrong codes.
    for (let i = 0; i < 5; i++) {
      await verifyOtp(verifyReq({ email, code: wrong }));
    }

    // Even the correct code is now rejected until a new one is requested.
    const res = await verifyOtp(verifyReq({ email, code }));
    expect(res.status).toBe(429);
  });

  it('rejects malformed input with 400', async () => {
    const res = await verifyOtp(verifyReq({ email: 'not-an-email', code: '123456' }));
    expect(res.status).toBe(400);
  });
});
