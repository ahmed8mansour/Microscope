import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

// PII anonymization moved here from feature 001's order-level test: contact
// (email, WhatsApp) now lives on `users`, not `orders`.
describe.skipIf(!hasDb)('user.repository — PII anonymization', () => {
  let userRepo: typeof import('@/features/checkout/data/user.repository');
  let db: typeof import('@/lib/db').db;
  let users: typeof import('@/lib/db/schema').users;
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    userRepo = await import('@/features/checkout/data/user.repository');
    ({ db } = await import('@/lib/db'));
    ({ users } = await import('@/lib/db/schema'));
  });

  afterAll(async () => {
    if (!hasDb || createdUserIds.length === 0) return;
    const { inArray } = await import('drizzle-orm');
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  it('anonymizePii clears contact fields but keeps verified state and id intact', async () => {
    const email = `pii-${Date.now()}-${Math.random()}@example.com`;
    const user = await userRepo.createOrFindUser(email, '+15551234567');
    createdUserIds.push(user.id);

    const anonymized = await userRepo.anonymizePii(user.id);

    expect(anonymized.email).toBeNull();
    expect(anonymized.whatsapp).toBeNull();
    expect(anonymized.id).toBe(user.id);
    expect(anonymized.verified).toBe(user.verified);
  });
});
