"use client";

interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

export default function Eyebrow({ children, className = "" }: EyebrowProps) {
  return (
    <span
      className={`text-caption text-wattle inline-block ${className}`}
    >
      {children}
    </span>
  );
}
