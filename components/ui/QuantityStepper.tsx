"use client";

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  // Disabled while a re-price is in flight or during payment confirmation
  // (the amount must not change once confirming) — feature 005, FR-002a.
  disabled?: boolean;
}

// Accessible +/− quantity stepper (feature 005, FR-001). Controlled; clamps to
// a minimum of 1 (no upper cap). The `−` button is disabled at 1. The live
// value is exposed to assistive tech via `aria-live` and a labelled group.
export default function QuantityStepper({ value, onChange, disabled = false }: QuantityStepperProps) {
  const atMin = value <= 1;

  function dec() {
    if (!disabled && !atMin) onChange(value - 1);
  }
  function inc() {
    if (!disabled) onChange(value + 1);
  }

  return (
    <div
      role="group"
      aria-label="Quantity"
      className="inline-flex items-center gap-3 select-none"
    >
      <button
        type="button"
        onClick={dec}
        disabled={disabled || atMin}
        aria-label="Decrease quantity"
        className="h-9 w-9 inline-flex items-center justify-center rounded-[4px] border border-ink/20 text-ink text-lg leading-none transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        &minus;
      </button>
      <span
        aria-live="polite"
        aria-atomic="true"
        className="min-w-[2ch] text-center font-body text-ink tabular-nums"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={disabled}
        aria-label="Increase quantity"
        className="h-9 w-9 inline-flex items-center justify-center rounded-[4px] border border-ink/20 text-ink text-lg leading-none transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        +
      </button>
    </div>
  );
}
