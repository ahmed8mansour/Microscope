// Small hand-drawn notebook marks. Decorative only: aria-hidden, no pointer
// events (see .nb-* rules in globals.css), and only reusing words that already
// exist on the page.

/** A loose, slightly open hand-drawn ellipse to sit around a word or a dot. */
export function HandCircle({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 80"
      preserveAspectRatio="none"
      fill="none"
      stroke="var(--leaf-note)"
      strokeWidth={3}
      strokeLinecap="round"
      className={`pointer-events-none absolute overflow-visible ${className}`}
      style={style}
    >
      <path d="M22 44 C 14 14, 90 4, 150 12 C 196 20, 200 58, 150 68 C 96 80, 18 74, 12 44 C 10 30, 30 20, 52 16" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A curved hand-drawn arrow (points down-left). */
export function HandArrow({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 60"
      width={80}
      height={60}
      fill="none"
      stroke="var(--leaf-note)"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`pointer-events-none ${className}`}
    >
      <path d="M72 6 C 58 8, 30 12, 14 44" />
      <path d="M8 30 L 14 46 L 30 40" />
    </svg>
  );
}
