import { describe, expect, it } from 'vitest';
import { classifyEventKind } from '@/features/orders/domain/webhook-classification';
import type { WebhookEventKind } from '@/lib/payments/types';

describe('classifyEventKind', () => {
  const statusCases: [WebhookEventKind, string][] = [
    ['succeeded', 'success'],
    ['failed', 'failed'],
    ['canceled', 'failed'],
    ['refunded', 'refunded'],
  ];

  it.each(statusCases)('%s maps to target status %s', (kind, expected) => {
    expect(classifyEventKind(kind).targetStatus).toBe(expected);
  });

  const noStatusCases: [WebhookEventKind, string][] = [
    ['refund_partial', 'flagged'],
    ['dispute', 'flagged'],
    ['other', 'ignored'],
  ];

  it.each(noStatusCases)(
    '%s has no target status and defaults to outcome %s',
    (kind, expectedOutcome) => {
      const result = classifyEventKind(kind);
      expect(result.targetStatus).toBeNull();
      expect(result.outcomeIfNoStatus).toBe(expectedOutcome);
    }
  );
});
