import type { PaymentStatus } from '@/features/orders';

// Shared presentation helpers for the admin console.

export function formatMoney(minorUnits: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(minorUnits / 100);
}

// Whole-dollar figure (no cents) for large hero numbers, with the currency
// symbol split out so the display component can size it independently.
export function formatMoneyParts(minorUnits: number, currency = 'AUD'): {
  symbol: string;
  amount: string;
} {
  const parts = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).formatToParts(minorUnits / 100);
  const symbol = parts.find((p) => p.type === 'currency')?.value ?? '$';
  const amount = parts
    .filter((p) => p.type !== 'currency')
    .map((p) => p.value)
    .join('')
    .trim();
  return { symbol, amount };
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

// Status → visual identity, mapped onto the store's five brand tokens.
// success = eucalypt (the good, settled state), pending = wattle (in-flight
// amber), failed = cinnabar (alarm), refunded = neutral ink (money returned,
// de-emphasised).
export interface StatusStyle {
  label: string;
  swatch: string; // solid brand colour for meters/legends/dots
  pillClass: string; // Tailwind classes for a pill badge
}

export const STATUS_STYLES: Record<PaymentStatus, StatusStyle> = {
  success: {
    label: 'Success',
    swatch: 'var(--eucalypt)',
    pillClass: 'bg-eucalypt text-paper-bone',
  },
  pending: {
    label: 'Pending',
    swatch: 'var(--wattle)',
    pillClass: 'bg-wattle text-ink',
  },
  failed: {
    label: 'Failed',
    swatch: 'var(--cinnabar)',
    pillClass: 'bg-cinnabar text-paper-bone',
  },
  refunded: {
    label: 'Refunded',
    swatch: 'rgba(27,27,27,0.45)',
    pillClass: 'bg-ink/10 text-ink/70',
  },
};

export const STATUS_ORDER: PaymentStatus[] = ['success', 'pending', 'failed', 'refunded'];
