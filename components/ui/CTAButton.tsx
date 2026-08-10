"use client";

interface CTAButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export default function CTAButton({ children, href, onClick, className = "" }: CTAButtonProps) {
  const baseClasses =
    "inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 bg-cinnabar text-paper-bone font-body text-lg font-medium rounded-[4px] transition-opacity cursor-pointer hover:opacity-90 " +
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
