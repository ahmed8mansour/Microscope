import { describe, expect, it } from 'vitest';
import { isAuthorizedForSnapshot } from '@/features/payment/domain/access-scope';

describe('isAuthorizedForSnapshot', () => {
  it('authorizes when the supplied secret matches exactly', () => {
    expect(isAuthorizedForSnapshot('pi_123_secret_abc', 'pi_123_secret_abc')).toBe(true);
  });

  it('rejects a mismatched secret', () => {
    expect(isAuthorizedForSnapshot('pi_123_secret_wrong', 'pi_123_secret_abc')).toBe(false);
  });

  it('rejects an empty supplied secret', () => {
    expect(isAuthorizedForSnapshot('', 'pi_123_secret_abc')).toBe(false);
  });

  it('rejects a secret that is a substring/prefix of the real one', () => {
    expect(isAuthorizedForSnapshot('pi_123_secret', 'pi_123_secret_abc')).toBe(false);
  });

  it('never authorizes purely by guessing an order/intent id (no partial match)', () => {
    // Knowing only "pi_123" (the id) without the secret suffix must fail.
    expect(isAuthorizedForSnapshot('pi_123', 'pi_123_secret_abc')).toBe(false);
  });
});
