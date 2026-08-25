"use client";

interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export default function Eyebrow({ children, className = "", ...rest }: EyebrowProps) {
  return (
    <span
      className={`text-caption text-wattle-ink inline-block ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
