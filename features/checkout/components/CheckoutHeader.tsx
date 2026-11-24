import Link from "next/link";

// "Field Notes" wordmark + cart icon + corner crop marks, as on the landing
// page. Purely presentational: the cart icon is decorative (no cart exists).
export default function CheckoutHeader() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-6 md:px-12 lg:px-16">
        <Link href="/" className="flex items-center gap-2.5 font-display text-2xl md:text-[28px] text-ink tracking-tight">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-leaf-chip text-leaf-accent">
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 18h12" />
              <path d="M3 22h18" />
              <path d="M14 22a7 7 0 1 0 0-14h-1" />
              <path d="M9 14h2" />
              <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
              <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
            </svg>
          </span>
          Field Notes
        </Link>
        <span
          aria-hidden
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--leaf-card-border)] bg-leaf-chip text-leaf-accent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
        </span>
      </header>
      {/* corner crop marks (md and up) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10"
        style={{ ["--nb-ink" as string]: "var(--leaf-ink)" }}
      >
        <span className="nb-crop nb-crop--tl" />
        <span className="nb-crop nb-crop--tr" />
        <span className="nb-crop nb-crop--bl" />
        <span className="nb-crop nb-crop--br" />
      </div>
    </>
  );
}
