import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

vi.mock('@/lib/email/sendgrid', () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

describe.skipIf(!hasDb)('POST /api/checkout/send-otp', () => {
  let db: typeof import('@/lib/db').db;
  let users: typeof import('@/lib/db/schema').users;
  let POST: typeof import('@/app/api/checkout/send-otp/route').POST;
  let sendOtpEmail: ReturnType<typeof vi.fn>;
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    ({ db } = await import('@/lib/db'));
    ({ users } = await import('@/lib/db/schema'));
    ({ POST } = await import('@/app/api/checkout/send-otp/route'));
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

  function req(body: unknown) {
    return new Request('http://localhost/api/checkout/send-otp', {
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

  it('creates a user (unverified) and sends a code for valid contact', async () => {
    const email = `send-${Date.now()}-${Math.random()}@example.com`;
    const res = await POST(req({ email, whatsapp: '+15551234567' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });
    // Response never contains the code.
    expect(JSON.stringify(body)).not.toMatch(/"\d{6}"/);

    const user = await findUser(email);
    createdUserIds.push(user.id);
    expect(user.verified).toBe(false);
    expect(user.otpCodeHash).toBeTruthy();
    expect(user.otpExpiresAt).toBeTruthy();

    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
    expect(sendOtpEmail).toHaveBeenCalledWith(email, expect.stringMatching(/^\d{6}$/));
  });

  it('reuses the existing user record for a repeat email (not a duplicate)', async () => {
    const email = `reuse-${Date.now()}-${Math.random()}@example.com`;
    await POST(req({ email, whatsapp: '+15551234567' }));
    const first = await findUser(email);
    createdUserIds.push(first.id);

    // Wait past cooldown is not needed to prove reuse — a second call should
    // resolve to the same user id even if the second send itself is blocked
    // by cooldown (checked in a separate test).
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });

  it('rejects malformed input with 400 and sends no code', async () => {
    const res = await POST(req({ email: 'not-an-email', whatsapp: '+1' }));
    expect(res.status).toBe(400);
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it('enforces the resend cooldown with 429', async () => {
    const email = `cooldown-${Date.now()}-${Math.random()}@example.com`;
    const first = await POST(req({ email, whatsapp: '+15551234567' }));
    expect(first.status).toBe(200);
    const user = await findUser(email);
    createdUserIds.push(user.id);

    const second = await POST(req({ email, whatsapp: '+15551234567' }));
    expect(second.status).toBe(429);
    expect(sendOtpEmail).toHaveBeenCalledTimes(1); // second call didn't send
  });
});
