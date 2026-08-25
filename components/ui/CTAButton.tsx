"use client";

interface CTAButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  /** primary = cinnabar fill (default), secondary = ink outline on paper. */
  variant?: "primary" | "secondary";
}

const VARIANTS: Record<NonNullable<CTAButtonProps["variant"]>, string> = {
  primary: "bg-cinnabar text-accent-ink font-semibold hover:shadow-[var(--glow-accent)]",
  secondary:
    "bg-transparent text-ink border border-ink/25 hover:border-ink/50 hover:shadow-[var(--elev-1)]",
};

export default function CTAButton({
  children,
  href,
  onClick,
  className = "",
  variant = "primary",
}: CTAButtonProps) {
  const baseClasses =
    "inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 font-body text-lg font-medium rounded-[var(--radius-sm)] cursor-pointer " +
    "transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] " +
    "hover:-translate-y-0.5 active:translate-y-0 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eucalypt " +
    VARIANTS[variant] +
    " " +
    className;

  if (href) {
    return (
      <a href={href} className={baseClasses}>
        {children}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={baseClasses}>
      {children}
    </button>
  );
}
