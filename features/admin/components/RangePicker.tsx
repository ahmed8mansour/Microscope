'use client';

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export default function RangePicker({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="ledger-label hidden sm:inline">Range</span>
      <div className="flex rounded-lg border border-ink/15 bg-paper-raised p-0.5" role="group" aria-label="Date range">
        {PRESETS.map((preset) => {
          const active = days === preset.days;
          return (
            <button
              key={preset.days}
              type="button"
              onClick={() => onChange(preset.days)}
              className={`admin-focus rounded-[6px] px-3 py-1 text-xs transition-colors ${
                active ? 'bg-ink text-paper-bone' : 'text-ink/60 hover:text-ink'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
